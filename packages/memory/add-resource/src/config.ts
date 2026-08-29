import z from '@deepseek-ai/schemastery'

export interface Config {
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  watchStorePath: string
}

export interface ResolvedConfig {
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  watchStorePath: string
}

export const DEFAULT_OV_URL = 'http://127.0.0.1:1933/mcp'
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_WATCH_STORE_PATH = 'C:/Users/Dustin/.dsh/ov-watches.json'

export const Config: z<Config> = z.object({
  url: z.string().default(DEFAULT_OV_URL),
  apiKey: z.string().default(''),
  account: z.string().default('default'),
  user: z.string().default('default'),
  timeoutMs: z.number().min(1000).max(600_000).default(DEFAULT_TIMEOUT_MS),
  watchStorePath: z.string().default(DEFAULT_WATCH_STORE_PATH),
}) as unknown as z<Config>

export function resolveConfig(config: Config): ResolvedConfig {
  const env = (typeof process !== 'undefined' ? process.env : undefined) ?? {}
  return {
    url: config.url || env.OPENVIKING_URL || DEFAULT_OV_URL,
    apiKey: config.apiKey || env.OPENVIKING_API_KEY || '',
    account: config.account || env.OPENVIKING_ACCOUNT || 'default',
    user: config.user || env.OPENVIKING_USER || 'default',
    timeoutMs: Number.isFinite(config.timeoutMs) ? Math.floor(config.timeoutMs) : DEFAULT_TIMEOUT_MS,
    watchStorePath: config.watchStorePath || DEFAULT_WATCH_STORE_PATH,
  }
}