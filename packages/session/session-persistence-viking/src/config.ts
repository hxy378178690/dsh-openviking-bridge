import z from '@deepseek-ai/schemastery'

export interface Config {
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  userScope: string
  scope: { user?: string; project?: string }
  maxConcurrentWrites: number
  excludedEventTypes: string[]
}

export interface ResolvedConfig {
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  userScope: string
  scope: { user?: string; project?: string }
  maxConcurrentWrites: number
  excludedEventTypes: Set<string>
}

export const DEFAULT_OV_URL = 'http://127.0.0.1:1933/mcp'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_USER_SCOPE = 'memories'
export const DEFAULT_MAX_CONCURRENT = 4
export const DEFAULT_EXCLUDED: readonly string[] = ['heartbeat']

export const Config: z<Config> = z.object({
  url: z.string().default(DEFAULT_OV_URL),
  apiKey: z.string().default(''),
  account: z.string().default('default'),
  user: z.string().default('default'),
  timeoutMs: z.number().min(1000).max(300_000).default(DEFAULT_TIMEOUT_MS),
  userScope: z.string().min(1).default(DEFAULT_USER_SCOPE),
  scope: z.object({
    user: z.string().default(''),
    project: z.string().default(''),
  }).default({ user: '', project: '' }),
  maxConcurrentWrites: z.number().min(1).max(64).default(DEFAULT_MAX_CONCURRENT),
  excludedEventTypes: z.array(z.string()).default([...DEFAULT_EXCLUDED]),
}) as unknown as z<Config>

export function resolveConfig(config: Config): ResolvedConfig {
  const env = (typeof process !== 'undefined' ? process.env : undefined) ?? {}
  return {
    url: config.url || env.OPENVIKING_URL || DEFAULT_OV_URL,
    apiKey: config.apiKey || env.OPENVIKING_API_KEY || '',
    account: config.account || env.OPENVIKING_ACCOUNT || 'default',
    user: config.user || env.OPENVIKING_USER || 'default',
    timeoutMs: Number.isFinite(config.timeoutMs) ? Math.floor(config.timeoutMs) : DEFAULT_TIMEOUT_MS,
    userScope: config.userScope || DEFAULT_USER_SCOPE,
    scope: { ...(config.scope ?? {}) },
    maxConcurrentWrites: Math.max(1, Math.min(64, Math.floor(config.maxConcurrentWrites))),
    excludedEventTypes: new Set((config.excludedEventTypes ?? [...DEFAULT_EXCLUDED]).map((t) => t.toLowerCase())),
  }
}