import z from '@deepseek-ai/schemastery'

export type MemorySearchTool = 'find' | 'recall'

export interface Config {
  maxTokens: number
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  memorySearchTool: MemorySearchTool
  searchLimit: number
  recallBudget: number
}

export interface ResolvedConfig {
  maxTokens: number
  url: string
  apiKey: string
  account: string
  user: string
  timeoutMs: number
  memorySearchTool: MemorySearchTool
  searchLimit: number
  recallBudget: number
}

export const DEFAULT_MAX_TOKENS = 800
export const DEFAULT_OV_URL = 'http://127.0.0.1:1933/mcp'
export const DEFAULT_TIMEOUT_MS = 30_000
export const DEFAULT_SEARCH_LIMIT = 3
export const DEFAULT_RECALL_BUDGET = 4000

export const Config: z<Config> = z.object({
  maxTokens: z.number().min(0).default(DEFAULT_MAX_TOKENS),
  url: z.string().default(DEFAULT_OV_URL),
  apiKey: z.string().default(''),
  account: z.string().default('default'),
  user: z.string().default('default'),
  timeoutMs: z.number().min(1000).max(120_000).default(DEFAULT_TIMEOUT_MS),
  memorySearchTool: z.string().default('find'),
  searchLimit: z.number().min(1).max(20).default(DEFAULT_SEARCH_LIMIT),
  recallBudget: z.number().min(256).max(16_000).default(DEFAULT_RECALL_BUDGET),
}) as unknown as z<Config>

export function resolveConfig(config: Config): ResolvedConfig {
  const env = (typeof process !== 'undefined' ? process.env : undefined) ?? {}
  const apiKey = config.apiKey || env.OPENVIKING_API_KEY || ''
  const tool: MemorySearchTool = config.memorySearchTool === 'recall' ? 'recall' : 'find'
  return {
    maxTokens: Number.isFinite(config.maxTokens) ? Math.floor(config.maxTokens) : DEFAULT_MAX_TOKENS,
    url: config.url || env.OPENVIKING_URL || DEFAULT_OV_URL,
    apiKey,
    account: config.account || env.OPENVIKING_ACCOUNT || 'default',
    user: config.user || env.OPENVIKING_USER || 'default',
    timeoutMs: Number.isFinite(config.timeoutMs) ? Math.floor(config.timeoutMs) : DEFAULT_TIMEOUT_MS,
    memorySearchTool: tool,
    searchLimit: Math.max(1, Math.min(20, Math.floor(config.searchLimit))),
    recallBudget: Math.max(256, Math.min(16_000, Math.floor(config.recallBudget))),
  }
}