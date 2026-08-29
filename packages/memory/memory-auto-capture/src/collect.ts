import type { SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'

export interface CapturedMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CollectInput {
  events: readonly SessionEvent[]
  turn: number
  maxMessages: number
  maxCharsPerMessage: number
}

export interface CollectOutput {
  messages: CapturedMessage[]
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

interface EventWithTurn {
  type: string
  data?: { turn?: number; step?: number; message?: { content?: unknown }; content?: unknown }
}

function collectForTurn(input: CollectInput): CollectOutput {
  const events = input.events as readonly EventWithTurn[]
  const n = events.length
  let startSeq = n
  let endSeq = n - 1
  for (let i = n - 1; i >= 0; i--) {
    const event = events[i]
    if (!event) continue
    if (event.type === 'turn/end' && event.data?.turn === input.turn) {
      startSeq = i
      for (let j = i - 1; j >= 0; j--) {
        const earlier = events[j]
        if (earlier?.type === 'turn/start' && earlier.data?.turn === input.turn) {
          startSeq = j
          break
        }
      }
      endSeq = i
      break
    }
    if (event.type === 'turn/start' && event.data?.turn === input.turn) {
      startSeq = i
      endSeq = n - 1
      break
    }
  }
  if (startSeq >= n) return { messages: [] }
  const out: CapturedMessage[] = []
  for (let i = startSeq; i <= endSeq; i++) {
    const event = events[i]
    if (!event) continue
    if (event.type === 'user/message') {
      const text = trim(flattenText((event.data as unknown as UserMessage).content), input.maxCharsPerMessage)
      if (text) out.push({ role: 'user', content: text })
    } else if (event.type === 'assistant/message') {
      const inner = event.data?.message
      const text = trim(flattenText(inner?.content), input.maxCharsPerMessage)
      if (text) out.push({ role: 'assistant', content: text })
    }
    if (out.length >= input.maxMessages) break
  }
  return { messages: out }
}

export function collectTurnContent(input: CollectInput): CollectOutput {
  return collectForTurn(input)
}

export function collectUserTurnContent(input: CollectInput): CollectOutput {
  const collected = collectForTurn(input)
  return { messages: collected.messages.filter((m) => m.role === 'user') }
}