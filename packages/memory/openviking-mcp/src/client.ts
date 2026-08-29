/**
 * OpenViking HTTP client.
 *
 * Talks directly to `http://127.0.0.1:1933/mcp` via streamable HTTP JSON-RPC,
 * bypassing the ToolRuntime. Plugin code (memory auto-recall/capture, viking
 * mirror) needs raw HTTP because synthesizing a full `ToolExecution` for
 * cross-plugin tool dispatch would violate the registry's caller-owned
 * invariants. HTTP keeps the plugin self-contained.
 *
 * @module @deepseek-ai/dsh-openviking-mcp/client
 */

import type { JsonValue } from '@deepseek-ai/dsh-tools'

export interface OpenVikingClientOptions {
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
}

export interface OpenVikingCallResult {
  content: JsonValue[]
  structuredContent?: JsonValue
  isError?: boolean
}

export class OpenVikingUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`openViking unavailable: ${String(cause)}`)
    this.name = 'OpenVikingUnavailableError'
    ;(this as { cause?: unknown }).cause = cause
  }
}

export class OpenVikingToolError extends Error {
  constructor(tool: string, message: string) {
    super(`openViking tool "${tool}" failed: ${message}`)
    this.name = 'OpenVikingToolError'
    ;(this as { tool?: string }).tool = tool
  }
}

function headers(opts: OpenVikingClientOptions): Record<string, string> {
  return {
    'Authorization': `Bearer ${opts.apiKey}`,
    'X-OpenViking-Account': opts.account,
    'X-OpenViking-User': opts.user,
    'Accept': 'application/json, text/event-stream',
    'Content-Type': 'application/json',
  }
}

function parseEventStream(payload: string): JsonValue {
  const dataLines: string[] = []
  for (const raw of payload.split('\n')) {
    if (raw.startsWith('data:')) dataLines.push(raw.slice(5).trim())
  }
  if (dataLines.length === 0) throw new Error('empty SSE payload')
  return JSON.parse(dataLines.join('\n')) as JsonValue
}

async function jsonRpc(
  opts: OpenVikingClientOptions,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonValue> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1e9),
    method,
    ...(params !== undefined ? { params } : {}),
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`openViking ${method} timed out after ${opts.timeoutMs}ms`)), opts.timeoutMs)
  let response: Response
  try {
    response = await fetch(opts.url, {
      method: 'POST',
      headers: headers(opts),
      body,
      signal: controller.signal,
    })
  } catch (error) {
    throw new OpenVikingUnavailableError(error)
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    throw new OpenVikingUnavailableError(`HTTP ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  let parsed: JsonValue
  try {
    parsed = parseEventStream(text)
  } catch (error) {
    throw new OpenVikingUnavailableError(`SSE parse failed: ${String(error)}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new OpenVikingUnavailableError('non-object response')
  }
  const obj = parsed as { error?: { message?: string }; result?: JsonValue }
  if (obj.error) {
    throw new OpenVikingToolError(method, obj.error.message ?? JSON.stringify(obj.error))
  }
  if (obj.result === undefined) throw new OpenVikingUnavailableError('missing result')
  return obj.result
}

export async function callOpenVikingTool(
  opts: OpenVikingClientOptions,
  name: string,
  args: Record<string, unknown>,
): Promise<OpenVikingCallResult> {
  const result = await jsonRpc(opts, 'tools/call', { name, arguments: args })
  if (typeof result !== 'object' || result === null) {
    throw new OpenVikingUnavailableError('tool result not object')
  }
  const r = result as { content?: JsonValue[]; structuredContent?: JsonValue; isError?: boolean }
  return {
    content: Array.isArray(r.content) ? r.content : [],
    ...(r.structuredContent !== undefined ? { structuredContent: r.structuredContent } : {}),
    ...(r.isError !== undefined ? { isError: r.isError } : {}),
  }
}

export function defaultOptions(overrides: Partial<OpenVikingClientOptions> = {}): OpenVikingClientOptions {
  return {
    url: overrides.url ?? 'http://127.0.0.1:1933/mcp',
    apiKey: overrides.apiKey ?? '',
    account: overrides.account ?? 'default',
    user: overrides.user ?? 'default',
    timeoutMs: overrides.timeoutMs ?? 30_000,
  }
}

export function extractToolText(result: OpenVikingCallResult): string {
  if (typeof result.structuredContent === 'object' && result.structuredContent !== null) {
    const inner = (result.structuredContent as { result?: unknown }).result
    if (typeof inner === 'string') return inner
  }
  const parts: string[] = []
  for (const block of Array.isArray(result.content) ? result.content : []) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as { type?: string; text?: string }
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('\n').trim()
}