export interface VikingUriInput {
  sessionId: string
  seq: number
  eventType: string
  userScope: string
}

export interface RenderedEventMarkdown {
  uri: string
}

export interface RenderEventInput {
  sessionId: string
  seq: number
  eventType: string
  payload: unknown
  scope: { user?: string; project?: string }
}

const SAFE_ID = /[^a-zA-Z0-9._-]/g

function safeSessionId(id: string): string {
  return id.replace(SAFE_ID, '_').slice(0, 96) || 'unknown'
}

export function buildVikingUri(input: VikingUriInput): string {
  const sessionId = safeSessionId(input.sessionId)
  const scope = input.userScope.replace(/^\/+|\/+$/g, '') || 'memories'
  const seq = String(Math.max(0, Math.floor(input.seq))).padStart(6, '0')
  const type = String(input.eventType || 'event').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 48) || 'event'
  return `viking://user/${scope}/${sessionId}/${seq}-${type}.md`
}

export function renderEventMarkdown(input: RenderEventInput): string {
  const header = [
    `# session: ${input.sessionId}`,
    `# seq: ${input.seq}`,
    `# type: ${input.eventType}`,
    `# timestamp: ${new Date().toISOString()}`,
    `# scope: user=${input.scope.user ?? ''} project=${input.scope.project ?? ''}`,
  ].join('\n')
  let body: string
  try {
    body = JSON.stringify(input.payload, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)
  } catch {
    body = '[unserializable payload]'
  }
  return `${header}\n\n${body}\n`
}