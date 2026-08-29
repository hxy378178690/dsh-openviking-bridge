/**
 * OpenViking session-mirror Provider.
 *
 * A one-way mirror that observes `session/event` and writes each event to
 * `viking://user/memories/<sessionId>/<seq:06d>-<eventType>.md` through the
 * OV MCP `write` tool. The SQLite session-persistence backend remains the
 * authoritative store: this provider never reads from OV and never replaces
 * `loadStored` / `readStoredRevision` / `list`. Writes are `mode='create'`
 * (one URI per event, no read-modify-write race), fire-and-forget, and never
 * block the main persistence path. Failure on any single event is warn-logged
 * and the next event still goes through.
 *
 * URIs omit the `<userId>` segment because OpenViking resolves
 * `viking://user/memories/...` against the `X-OpenViking-User` HTTP header.
 *
 * @module @deepseek-ai/dsh-session-persistence-viking
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { callOpenVikingTool, defaultOptions, type OpenVikingClientOptions } from '@deepseek-ai/dsh-openviking-mcp'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { name } from './state.ts'
import { buildVikingUri, renderEventMarkdown } from './render.ts'

export { Config, name }
export type { ResolvedConfig } from './config.ts'
export { buildVikingUri, renderEventMarkdown } from './render.ts'

interface WriteQueue {
  inflight: number
  maxInflight: number
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved: ResolvedConfig = resolveConfig(config)
  if (!resolved.apiKey) {
    ctx.logger.warn('session-persistence-viking: apiKey not set; mirror is inert')
  }
  const opts: OpenVikingClientOptions = defaultOptions({
    url: resolved.url,
    apiKey: resolved.apiKey,
    account: resolved.account,
    user: resolved.user,
    timeoutMs: resolved.timeoutMs,
  })
  const queue: WriteQueue = { inflight: 0, maxInflight: resolved.maxConcurrentWrites }
  const lifecycle = new AbortController()
  ctx.effect(() => () => lifecycle.abort(new Error('session-persistence-viking disposed')), 'session-persistence-viking.lifecycle')

  ctx.on('session/event', (session: Session, event: SessionEvent): void => {
    if (lifecycle.signal.aborted) return
    if (resolved.excludedEventTypes.has(event.type)) return
    const sessionId = session.header.id
    if (!sessionId) return
    const seq = (event as { seq?: number }).seq
    if (typeof seq !== 'number') return
    const uri = buildVikingUri({ sessionId, seq, eventType: event.type, userScope: resolved.userScope })
    const content = renderEventMarkdown({ sessionId, seq, eventType: event.type, payload: event.data, scope: resolved.scope })
    if (queue.inflight >= queue.maxInflight) {
      ctx.logger.warn(`session-persistence-viking: dropping mirror write for ${uri} (maxConcurrentWrites=${queue.maxInflight})`)
      return
    }
    queue.inflight += 1
    void (async () => {
      try {
        await callOpenVikingTool(opts, 'write', { uri, content, mode: 'create', wait: false })
      } catch (error) {
        ctx.logger.warn(`session-persistence-viking: write ${uri} failed: ${String(error)}`)
      } finally {
        queue.inflight = Math.max(0, queue.inflight - 1)
      }
    })()
  })

  ctx.effect(() => () => {
    lifecycle.abort(new Error('session-persistence-viking disposed'))
  }, 'session-persistence-viking.queue-lifecycle')
}