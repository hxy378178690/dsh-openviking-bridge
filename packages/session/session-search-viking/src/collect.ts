import type { SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'

export interface IndexedMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface IndexInput {
  events: readonly SessionEvent[]
  maxMessages: number
  maxCharsPerMessage: number
}

export interface IndexOutput {
  messages: IndexedMessage[]
  sessionId: string
}

function trim(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`
}

function flattenText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string') {
      if (b.text.includes('<system-reminder>') && b.text.includes('AGENTS.md')) continue
      parts.push(b.text)
    }
  }
  return parts.join('\n').trim()
}

interface EventWithKind {
  type: string
  data?: { turn?: number; message?: { content?: unknown }; content?: unknown }
}

export function collectSessionText(input: IndexInput): IndexOutput {
  const events = input.events as readonly EventWithKind[]
  const messages: IndexedMessage[] = []
  for (const event of events) {
    if (event.type === 'user/message') {
      const text = trim(flattenText((event.data as unknown as UserMessage).content), input.maxCharsPerMessage)
      if (text) messages.push({ role: 'user', content: text })
    } else if (event.type === 'assistant/message') {
      const inner = event.data?.message
      const text = trim(flattenText(inner?.content), input.maxCharsPerMessage)
      if (text) messages.push({ role: 'assistant', content: text })
    }
    if (messages.length >= input.maxMessages) break
  }
  return { messages, sessionId: '' }
}