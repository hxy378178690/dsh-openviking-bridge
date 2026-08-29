import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  callOpenVikingTool,
  defaultOptions,
  extractToolText,
  OpenVikingToolError,
  OpenVikingUnavailableError,
  type OpenVikingCallResult,
} from '../src/client.ts'

const OPTS = {
  url: 'http://127.0.0.1:1933/mcp',
  apiKey: 'test-key',
  account: 'default',
  user: 'default',
  timeoutMs: 5_000,
}

function ssePayload(jsonObject: unknown): string {
  return `event: message\ndata: ${JSON.stringify(jsonObject)}\n\n`
}

function jsonRpcOk(id: number, result: unknown): string {
  return ssePayload({ jsonrpc: '2.0', id, result })
}

function jsonRpcErr(id: number, message: string): string {
  return ssePayload({ jsonrpc: '2.0', id, error: { message } })
}

function makeResponse(body: string, ok = true): Response {
  return new Response(body, {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

describe('defaultOptions', () => {
  it('returns expected defaults', () => {
    const opts = defaultOptions()
    expect(opts.url).toBe('http://127.0.0.1:1933/mcp')
    expect(opts.apiKey).toBe('')
    expect(opts.account).toBe('default')
    expect(opts.user).toBe('default')
    expect(opts.timeoutMs).toBe(30_000)
  })

  it('respects overrides', () => {
    const opts = defaultOptions({
      url: 'http://x:1/mcp',
      apiKey: 'k',
      account: 'a',
      user: 'u',
      timeoutMs: 1000,
    })
    expect(opts).toEqual({
      url: 'http://x:1/mcp',
      apiKey: 'k',
      account: 'a',
      user: 'u',
      timeoutMs: 1000,
    })
  })
})

describe('extractToolText', () => {
  it('extracts structuredContent.result when string', () => {
    expect(extractToolText({ content: [], structuredContent: { result: 'hello' } })).toBe('hello')
  })

  it('ignores non-string structuredContent.result', () => {
    expect(extractToolText({ content: [], structuredContent: { result: 42 } })).toBe('')
  })

  it('extracts text blocks from content', () => {
    expect(extractToolText({
      content: [
        { type: 'text', text: 'one' },
        { type: 'image', url: 'x' },
        { type: 'text', text: 'two' },
      ],
    })).toBe('one\ntwo')
  })

  it('returns empty string when no text content', () => {
    expect(extractToolText({ content: [{ type: 'image', url: 'x' }] } as OpenVikingCallResult)).toBe('')
  })

  it('returns empty string when content is missing', () => {
    expect(extractToolText({ content: [] } as OpenVikingCallResult)).toBe('')
    expect(extractToolText({} as OpenVikingCallResult)).toBe('')
  })
})

describe('callOpenVikingTool', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns content from a successful tools/call', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(jsonRpcOk(2, {
      content: [{ type: 'text', text: 'ok' }],
    })))
    const result = await callOpenVikingTool(OPTS, 'find', { query: 'q', limit: 3 })
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }])
    expect(result.structuredContent).toBeUndefined()
    expect(result.isError).toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(OPTS.url)
    expect((init as RequestInit).method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${OPTS.apiKey}`)
    expect(headers['X-OpenViking-Account']).toBe(OPTS.account)
    expect(headers['X-OpenViking-User']).toBe(OPTS.user)
  })

  it('returns structuredContent when present', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(jsonRpcOk(2, {
      content: [{ type: 'text', text: 'ok' }],
      structuredContent: { result: { nested: 1 } },
    })))
    const result = await callOpenVikingTool(OPTS, 'find', { query: 'q' })
    expect(result.structuredContent).toEqual({ result: { nested: 1 } })
  })

  it('returns isError when present', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(jsonRpcOk(2, {
      content: [{ type: 'text', text: 'soft fail' }],
      isError: true,
    })))
    const result = await callOpenVikingTool(OPTS, 'find', { query: 'q' })
    expect(result.isError).toBe(true)
  })

  it('throws OpenVikingUnavailableError when tools/call result is not an object', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(jsonRpcOk(2, 'a string, not an object')))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('throws OpenVikingToolError on JSON-RPC error response', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(makeResponse(jsonRpcErr(2, 'tool boom'))))
    const promise = callOpenVikingTool(OPTS, 'find', { query: 'q' })
    await expect(promise).rejects.toBeInstanceOf(OpenVikingToolError)
    await expect(promise).rejects.toThrow(/tool boom/)
  })

  it('throws OpenVikingUnavailableError on HTTP non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('upstream gone', false))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('throws OpenVikingUnavailableError when fetch rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('throws OpenVikingUnavailableError when response body has no SSE data lines', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse('not an sse payload'))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('throws OpenVikingUnavailableError when JSON parses to non-object', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(ssePayload('not-an-object')))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('throws OpenVikingUnavailableError when result field is missing', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(ssePayload({ jsonrpc: '2.0', id: 2 })))
    await expect(callOpenVikingTool(OPTS, 'find', { query: 'q' })).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })

  it('aborts via AbortSignal when timeout fires', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url: unknown, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit).signal as AbortSignal | undefined
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
    )
    const promise = callOpenVikingTool({ ...OPTS, timeoutMs: 50 }, 'find', { query: 'q' })
    vi.advanceTimersByTime(60)
    await expect(promise).rejects.toBeInstanceOf(OpenVikingUnavailableError)
  })
})

describe('OpenVikingUnavailableError', () => {
  it('formats message from any cause', () => {
    const err = new OpenVikingUnavailableError('boom')
    expect(err.message).toBe('openViking unavailable: boom')
    expect(err.name).toBe('OpenVikingUnavailableError')
  })

  it('formats message from Error cause', () => {
    const err = new OpenVikingUnavailableError(new Error('ECONNRESET'))
    expect(err.message).toBe('openViking unavailable: Error: ECONNRESET')
  })
})

describe('OpenVikingToolError', () => {
  it('formats message with tool name', () => {
    const err = new OpenVikingToolError('find', 'no match')
    expect(err.message).toBe('openViking tool "find" failed: no match')
    expect(err.name).toBe('OpenVikingToolError')
  })
})