import * as fs from 'node:fs/promises'

export interface WatchRecord {
  uri: string
  source: string
  watchHandle: string
  addedAt: string
}

export async function loadWatches(path: string): Promise<WatchRecord[]> {
  const raw = await fs.readFile(path, 'utf8')
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('watch store must be an array')
  return parsed.filter((w): w is WatchRecord =>
    typeof w === 'object' && w !== null
    && typeof (w as WatchRecord).uri === 'string'
    && typeof (w as WatchRecord).source === 'string',
  )
}

export async function saveWatches(path: string, watches: WatchRecord[]): Promise<void> {
  await fs.mkdir(path.split('/').slice(0, -1).join('/'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(watches, null, 2), 'utf8')
}