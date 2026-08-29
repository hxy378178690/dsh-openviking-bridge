/**
 * OpenViking auto-capture Consumer.
 *
 * Listens to `session/event` and, on every `turn/end`, collects that turn's
 * `user/message` payload and pushes them through OV's `remember` MCP tool
 * (semantic commit, async extraction). Failures are warn-logged; the next turn
 * is never blocked on a failed commit. The Consumer skips commits whose
 * reason is `aborted` or `error` (unfinished turns have no stable content).
 *
 * When `mirrorWrites` is enabled (default: true), each successful commit is
 * ALSO mirrored via OV `write` to a deterministic URI under the canonical
 * `<user>` scope so the default `find` scope
 * (`viking://user/<user>/memories/`) surfaces it without an explicit
 * `target_uri`:
 *
 *     viking://user/<user>/memories/auto-capture/<sessionId>/<turn:03d>-<utc>.md
 *
 * The mirror write is the durable, inspectable receipt. `remember` is the
 * semantic commit (subject to OV async extraction + VLM summarization);
 * `write` is the synchronous, always-readable payload that lets the user
 * verify what actually landed in their memory store without grepping OV
 * internal indexes.
 *
 * @module @deepseek-ai/dsh-memory-auto-capture
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { callOpenVikingTool, defaultOptions, type OpenVikingClientOptions } from '@deepseek-ai/dsh-openviking-mcp'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { name } from './state.ts'
import { collectUserTurnContent, type CapturedMessage } from './collect.ts'

export { Config, name }
export type { ResolvedConfig } from './config.ts'
export type { CapturedMessage } from './collect.ts'

function shouldSkipTurn(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) return false
  const kind = (reason as { kind?: string }).kind
  return kind === 'aborted' || kind === 'error'
}

const SAFE = /[^a-z0-9_-]/g

function safeSessionId(id: string): string {
  return (id || 'unknown').replace(SAFE, '_').slice(0, 96)
}

function pad3(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0')
}

function utcStamp(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

function buildMirrorUri(opts: { user: string; sessionId: string; turn: number }): string {
  const user = (opts.user || 'default').replace(SAFE, '_')
  return `viking://user/${user}/memories/auto-capture/${safeSessionId(opts.sessionId)}/${pad3(opts.turn)}-${utcStamp()}.md`
}

function renderMirrorMarkdown(opts: { sessionId: string; turn: number; messages: CapturedMessage[] }): string {
  const header = [
    `# auto-capture`,
    `# session: ${opts.sessionId}`,
    `# turn: ${opts.turn}`,
    `# timestamp: ${new Date().toISOString()}`,
    `# source: memory-auto-capture`,
  ].join('\n')
  const body = opts.messages
    .map((m, i) => `## ${i + 1}. ${m.role}\n\n${m.content.trim()}`)
    .join('\n\n---\n\n')
  return `${header}\n\n${body}\n`
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved: ResolvedConfig = resolveConfig(config)
  if (!resolved.apiKey) {
    ctx.logger.warn('memory-auto-capture: apiKey not set; Consumer is inert')
  }
  const opts: OpenVikingClientOptions = defaultOptions({
    url: resolved.url,
    apiKey: resolved.apiKey,
    account: resolved.account,
    user: resolved.user,
    timeoutMs: resolved.timeoutMs,
  })

  ctx.on('session/event', async (session: Session, event: SessionEvent): Promise<void> => {
    if (event.type !== 'turn/end') return
    const reason = (event.data as { reason?: unknown }).reason
    if (shouldSkipTurn(reason)) return
    const turn = (event.data as { turn?: number }).turn
    if (typeof turn !== 'number' || turn < 1) return
    const captured = collectUserTurnContent({ events: session.events, turn, maxMessages: resolved.maxMessagesPerTurn, maxCharsPerMessage: resolved.maxCharsPerMessage })
    if (captured.messages.length === 0) return

    let mirrorUri: string | undefined
    if (resolved.mirrorWrites) {
      const sid = session.header.id ?? 'unknown'
      mirrorUri = buildMirrorUri({ user: resolved.user, sessionId: sid, turn })
      try {
        await callOpenVikingTool(opts, 'write', {
          uri: mirrorUri,
          content: renderMirrorMarkdown({ sessionId: sid, turn, messages: captured.messages }),
          mode: 'create',
          wait: true,
        })
      } catch (error) {
        ctx.logger.warn(`memory-auto-capture: write ${mirrorUri} failed: ${String(error)}`)
      }
    }

    try {
      await callOpenVikingTool(opts, 'remember', { messages: captured.messages, source: 'memory-auto-capture' })
    } catch (error) {
      ctx.logger.warn(`memory-auto-capture: remember failed for turn ${turn}: ${String(error)}`)
    }
  })
}