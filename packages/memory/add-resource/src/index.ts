import type { Context } from '@deepseek-ai/cordis'
import { callOpenVikingTool, defaultOptions, type OpenVikingClientOptions } from '@deepseek-ai/dsh-openviking-mcp'
import { Config, resolveConfig, type ResolvedConfig } from './config.ts'
import { name } from './state.ts'
import { loadWatches, saveWatches, type WatchRecord } from './store.ts'

export { Config, name }
export type { ResolvedConfig } from './config.ts'

const TOOL_PREFIX = 'openviking'

interface ToolRegistration {
  register(name: string, definition: ToolDefinition): void
  admit(name: string): boolean
}

interface ToolDefinition {
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>): Promise<unknown>
}

const TRIM = /[^a-z0-9_-]/g

function safeName(uri: string): string {
  return uri.replace(TRIM, '_').slice(0, 96) || 'watch'
}

async function callOV(opts: OpenVikingClientOptions, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await callOpenVikingTool(opts, name, args)
  return (result as { content?: unknown[]; structuredContent?: unknown }).structuredContent ?? result
}

async function loadStore(resolved: ResolvedConfig): Promise<WatchRecord[]> {
  try {
    return await loadWatches(resolved.watchStorePath)
  } catch (error) {
    return []
  }
}

async function persistStore(resolved: ResolvedConfig, watches: WatchRecord[]): Promise<void> {
  try {
    await saveWatches(resolved.watchStorePath, watches)
  } catch (error) {
  }
}

export async function apply(ctx: Context, config: Config): Promise<void> {
  const resolved: ResolvedConfig = resolveConfig(config)
  if (!resolved.apiKey) {
    ctx.logger.warn('add-resource: apiKey not set; Consumer is inert')
  }
  const opts: OpenVikingClientOptions = defaultOptions({
    url: resolved.url,
    apiKey: resolved.apiKey,
    account: resolved.account,
    user: resolved.user,
    timeoutMs: resolved.timeoutMs,
  })
  const tools = ctx.get('tools') as ToolRegistration | undefined
  if (!tools || typeof tools.register !== 'function') {
    ctx.logger.warn('add-resource: ctx.tools not available; tools not registered')
    return
  }

  const openvikingAddResource: ToolDefinition = {
    description: 'Add a local file / directory / Git repo / URL into OpenViking memory. The OV `add_resource` MCP tool indexes the source and tracks it for updates.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'Source identifier: absolute local path (e.g. D:\\notes\\project.md), directory path, git URL, or http(s) URL',
        },
        target_uri: {
          type: 'string',
          description: 'Optional destination URI under viking://user/<account>/<user>/resources/. Defaults to a content-derived name.',
        },
        recursive: {
          type: 'boolean',
          description: 'For directory / Git sources: walk subdirectories. Defaults to true.',
        },
        watch: {
          type: 'boolean',
          description: 'Subscribe to source changes. Defaults to true.',
        },
      },
      required: ['source'],
    },
    execute: async (args): Promise<unknown> => {
      const source = String(args['source'] ?? '')
      const targetUri = typeof args['target_uri'] === 'string' && args['target_uri'].length > 0
        ? String(args['target_uri'])
        : `viking://user/${resolved.account}/${resolved.user}/resources/${safeName(source)}`
      const recursive = args['recursive'] === false ? false : true
      const watch = args['watch'] === false ? false : true
      try {
        await callOV(opts, 'add_resource', { source, target_uri: targetUri, recursive })
      } catch (error) {
        throw new Error(`add_resource failed for ${source}: ${String(error)}`)
      }
      let watchHandle: string | undefined
      if (watch) {
        try {
          const watchResult = await callOV(opts, 'list_watches', {}) as { watches?: Array<{ uri: string }> }
          watchHandle = watchResult.watches?.[0]?.uri ?? `${targetUri}#watch`
        } catch (error) {
          watchHandle = `${targetUri}#watch-degraded`
        }
        const watches = await loadStore(resolved)
        const record: WatchRecord = {
          uri: targetUri,
          source,
          watchHandle,
          addedAt: new Date().toISOString(),
        }
        const filtered = watches.filter((w) => w.uri !== record.uri)
        filtered.push(record)
        await persistStore(resolved, filtered)
      }
      return {
        uri: targetUri,
        source,
        recursive,
        watch,
        watchHandle,
      }
    },
  }
  const openvikingListWatches: ToolDefinition = {
    description: 'List all OpenViking resource subscriptions recorded by this plugin.',
    parameters: { type: 'object', properties: {} },
    execute: async (): Promise<unknown> => {
      const watches = await loadStore(resolved)
      return { watches, count: watches.length }
    },
  }
  const openvikingCancelWatch: ToolDefinition = {
    description: 'Cancel a previously registered OpenViking resource subscription by URI.',
    parameters: {
      type: 'object',
      properties: {
        uri: {
          type: 'string',
          description: 'Target URI returned by openviking_add_resource',
        },
      },
      required: ['uri'],
    },
    execute: async (args): Promise<unknown> => {
      const uri = String(args['uri'] ?? '')
      if (!uri) throw new Error('uri is required')
      try {
        await callOV(opts, 'cancel_watch', { uri })
      } catch (error) {
        ctx.logger.warn(`add-resource: cancel_watch ${uri} failed: ${String(error)}`)
      }
      const watches = await loadStore(resolved)
      const filtered = watches.filter((w) => w.uri !== uri)
      await persistStore(resolved, filtered)
      return { cancelled: uri, remaining: filtered.length }
    },
  }

  const reg = tools as ToolRegistration
  if (reg.admit(`${TOOL_PREFIX}__add_resource`)) {
    reg.register(`${TOOL_PREFIX}__add_resource`, openvikingAddResource)
  }
  if (reg.admit(`${TOOL_PREFIX}__list_watches`)) {
    reg.register(`${TOOL_PREFIX}__list_watches`, openvikingListWatches)
  }
  if (reg.admit(`${TOOL_PREFIX}__cancel_watch`)) {
    reg.register(`${TOOL_PREFIX}__cancel_watch`, openvikingCancelWatch)
  }
}