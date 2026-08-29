import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { callOpenVikingTool, defaultOptions, type OpenVikingClientOptions } from '@deepseek-ai/dsh-openviking-mcp'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { name } from './state.ts'
import { collectSessionText } from './collect.ts'

export { Config, name }
export type { ResolvedConfig } from './config.ts'

const SAFE = /[^a-z0-9_-]/g

function safeSessionId(id: string): string {
  return (id || 'unknown').replace(SAFE, '_').slice(0, 96)
}

function utcStamp(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

function buildIndexUri(opts: { user: string; sessionId: string }): string {
  const user = (opts.user || 'default').replace(SAFE, '_')
  return `viking://user/${user}/sessions/${safeSessionId(opts.sessionId)}/index-${utcStamp()}.md`
}

function renderIndex(opts: { sessionId: string; messages: { role: string; content: string }[] }): string {
  const header = [
    `# session search index`,
    `# session: ${opts.sessionId}`,
    `# timestamp: ${new Date().toISOString()}`,
    `# source: session-search-viking`,
  ].join('\n')
  const body = opts.messages
    .map((m, i) => `## ${i + 1}. ${m.role}\n\n${m.content.trim()}`)
    .join('\n\n---\n\n')
  return `${header}\n\n${body}\n`
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved: ResolvedConfig = resolveConfig(config)
  if (!resolved.apiKey) {
    ctx.logger.warn('session-search-viking: apiKey not set; Consumer is inert')
  }
  const opts: OpenVikingClientOptions = defaultOptions({
    url: resolved.url,
    apiKey: resolved.apiKey,
    account: resolved.account,
    user: resolved.user,
    timeoutMs: resolved.timeoutMs,
  })

  ctx.on('session/event', (session: Session, event: SessionEvent): void => {
    if (event.type !== 'session/end-seed') return
    const sid = session.header.id
    if (!sid) return
    const collected = collectSessionText({
      events: session.events,
      maxMessages: resolved.maxMessagesPerSession,
      maxCharsPerMessage: resolved.maxCharsPerMessage,
    })
    if (collected.messages.length === 0) return
    const uri = buildIndexUri({ user: resolved.user, sessionId: sid })
    const content = renderIndex({ sessionId: sid, messages: collected.messages })
    void (async () => {
      try {
        await callOpenVikingTool(opts, 'write', {
          uri,
          content,
          mode: 'create',
          wait: false,
        })
      } catch (error) {
        ctx.logger.warn(`session-search-viking: write ${uri} failed: ${String(error)}`)
      }
    })()
  })
}