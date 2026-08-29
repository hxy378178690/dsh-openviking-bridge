/**
 * OpenViking auto-recall Consumer.
 *
 * Subscribes to the `agent/pre-step` waterfall and, before the agent decides
 * what to send, prepends a short text block of OpenViking semantic-search
 * results (driven by the trailing user message) to the entering batch via a
 * durable `user/message`. The block is sized by `maxTokens` and the token
 * meter; on any recall failure (OV not connected, find returned an error,
 * no trailing user text) the Consumer is silent and lets the next listener
 * run.
 *
 * Why `find`, not `recall`: OV's `recall` tool depends on the server-side
 * session context (it queries "this OV session"'s short-term memory). When
 * the HTTP-direct client invokes `tools/call` without first establishing a
 * `session_id`, `recall` returns "No relevant memories found" even when the
 * store does contain matches. `find` is a pure vector query that does not
 * require session context, so it works for stateless HTTP-direct callers.
 *
 * @module @deepseek-ai/dsh-memory-auto-recall
 */

import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { callOpenVikingTool, defaultOptions, extractToolText, type OpenVikingClientOptions } from '@deepseek-ai/dsh-openviking-mcp'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { name } from './state.ts'
import { renderRecallBlock } from './render.ts'

export { Config, name }
export type { ResolvedConfig } from './config.ts'
export type { RecallSource, RenderedRecall } from './render.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'memory-auto-recall': { kind: 'memory-auto-recall'; serverName: string; recallTokens: number; queryTokens: number }
  }
}

function trailingUserText(messages: readonly UserMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    for (const part of message.content) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim().length > 0) {
        return part.text
      }
    }
  }
  return ''
}

function clientOptions(resolved: ResolvedConfig): OpenVikingClientOptions {
  return defaultOptions({
    url: resolved.url,
    apiKey: resolved.apiKey,
    account: resolved.account,
    user: resolved.user,
    timeoutMs: resolved.timeoutMs,
  })
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved: ResolvedConfig = resolveConfig(config)
  if (!resolved.apiKey) {
    ctx.logger.warn('memory-auto-recall: apiKey not set; Consumer is inert')
  }
  const opts = clientOptions(resolved)

  ctx.on(
    'agent/pre-step',
    async ({ messages }, next): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject') return decision
      if (resolved.maxTokens <= 0) return decision
      const query = trailingUserText(messages)
      if (!query) return decision
      const budget = Math.max(64, Math.min(resolved.maxTokens, 1600))
      let text: string
      try {
        const tool = resolved.memorySearchTool
        const searchArgs = { query, limit: resolved.searchLimit }
        const autoCaptureArgs = {
          query,
          target_uri: `viking://user/${resolved.user}/memories/auto-capture/`,
          limit: resolved.searchLimit,
        }
        const [defaultResult, autoCaptureResult] = await Promise.all([
          callOpenVikingTool(opts, tool, searchArgs),
          callOpenVikingTool(opts, tool, autoCaptureArgs),
        ])
        const a = extractToolText(defaultResult)
        const b = extractToolText(autoCaptureResult)
        const combined = a && b ? `${b}\n\n${a}` : (a || b)
        text = combined.length > resolved.recallBudget
          ? combined.slice(0, resolved.recallBudget) + `\n…[truncated ${combined.length - resolved.recallBudget} chars]`
          : combined
      } catch (error) {
        ctx.logger.warn(`memory-auto-recall: ${resolved.memorySearchTool} failed: ${String(error)}`)
        return decision
      }
      if (!text) return decision
      const meter = ctx.get('tokenMeter') as { estimateMessage?: (m: UserMessage) => number } | undefined
      const recallMessage = createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'memory-auto-recall', serverName: 'openviking', recallTokens: budget, queryTokens: query.length },
      })
      const approxTokens = meter?.estimateMessage?.(recallMessage)
      if (approxTokens !== undefined && approxTokens > budget) {
        ctx.logger.warn(`memory-auto-recall: block ${approxTokens} > budget ${budget}, skipping`)
        return decision
      }
      const rendered = renderRecallBlock({ serverName: 'openviking', text, recallTokens: budget })
      if (!rendered) return decision
      const lastClaimed = decision.messages.findLastIndex((m) => messages.includes(m))
      const insertAt = lastClaimed + 1
      const entered = decision.messages.toSpliced(insertAt, 0, rendered)
      return { kind: 'enter', messages: entered }
    },
  )
}