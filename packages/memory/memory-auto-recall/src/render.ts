import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'

export interface RecallSource {
  serverName: string
  text: string
  recallTokens: number
}

export interface RenderedRecall {
  recall: UserMessage
}

export function renderRecallBlock(source: RecallSource): UserMessage | undefined {
  if (!source.text.trim()) return undefined
  const body = `<system-reminder source="memory-auto-recall" server="${source.serverName}">\n${source.text.trim()}\n</system-reminder>`
  return createUserMessage({
    content: [{ type: 'text', text: body }],
    source: {
      kind: 'memory-auto-recall',
      serverName: source.serverName,
      recallTokens: source.recallTokens,
      queryTokens: 0,
    },
  })
}