import z from '@deepseek-ai/schemastery'

export interface Config {
  maxMessagesPerTurn: number
  maxCharsPerMessage: number
  mirrorWrites: boolean
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
}

export interface ResolvedConfig {
  maxMessagesPerTurn: number
  maxCharsPerMessage: number
  mirrorWrites: boolean
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
}

export const DEFAULT_MAX_MESSAGES = 32
export const DEFAULT_MAX_CHARS = 4000
export const DEFAULT_OV_URL = 'http://127.0.0.1:1933/mcp'
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_MIRROR_WRITES = true

export const Config: z<Config> = z.object({
  maxMessagesPerTurn: z.number().min(1).default(DEFAULT_MAX_MESSAGES),
  maxCharsPerMessage: z.number().min(64).default(DEFAULT_MAX_CHARS),
  mirrorWrites: z.boolean().default(DEFAULT_MIRROR_WRITES),
  url: z.string().default(DEFAULT_OV_URL),
  apiKey: z.string().default(''),
  account: z.string().default('default'),
  user: z.string().default('default'),
  timeoutMs: z.number().min(1000).max(300_000).default(DEFAULT_TIMEOUT_MS),
}) as unknown as z<Config>

export function resolveConfig(config: Config): ResolvedConfig {
  const env = (typeof process !== 'undefined' ? process.env : undefined) ?? {}
  return {
    maxMessagesPerTurn: Number.isFinite(config.maxMessagesPerTurn) ? Math.floor(config.maxMessagesPerTurn) : DEFAULT_MAX_MESSAGES,
    maxCharsPerMessage: Number.isFinite(config.maxCharsPerMessage) ? Math.floor(config.maxCharsPerMessage) : DEFAULT_MAX_CHARS,
    mirrorWrites: config.mirrorWrites ?? DEFAULT_MIRROR_WRITES,
    url: config.url || env.OPENVIKING_URL || DEFAULT_OV_URL,
    apiKey: config.apiKey || env.OPENVIKING_API_KEY || '',
    account: config.account || env.OPENVIKING_ACCOUNT || 'default',
    user: config.user || env.OPENVIKING_USER || 'default',
    timeoutMs: Number.isFinite(config.timeoutMs) ? Math.floor(config.timeoutMs) : DEFAULT_TIMEOUT_MS,
  }
}