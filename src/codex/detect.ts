import type { DetectResult, ThreadData, ThreadTitles } from './types'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { AGENTS_CONFIG } from '../constants'
import { parseJSON, readJSON } from '../utils'
import { GLOBAL_STATE_PATH, SESSION_INDEX_PATH } from './constants'
import { getDatabasePaths, readSQLite } from './db'

export async function detectCodex(cwd = AGENTS_CONFIG.codex.path): Promise<DetectResult> {
  const globalState = await readJSON(GLOBAL_STATE_PATH)
  const sqlitePaths = await getDatabasePaths(cwd)
  const data = mergeThreads((await Promise.all(sqlitePaths.map(readSQLite))).flat())
  const sessionIndexTitles = await readSessionIndexTitles()

  const threadTitles: ThreadTitles = globalState?.['thread-titles'] ?? {
    titles: {},
    order: [],
  }

  const legacyTitles = threadTitles.titles

  return {
    threads: data
      .filter(i => i.title || i.id in legacyTitles || i.id in sessionIndexTitles)
      .sort((a, b) => a.updated_at > b.updated_at ? -1 : 1)
      .map((thread) => {
        const title = normalizeTitle(thread) || sessionIndexTitles[thread.id] || legacyTitles[thread.id]
        return {
          ...thread,
          title,
        }
      }),
    globalState,
    sqlitePaths,
  }
}

function mergeThreads(threads: ThreadData[]): ThreadData[] {
  const merged = new Map<string, ThreadData>()

  for (const thread of threads) {
    const current = merged.get(thread.id)
    if (!current) {
      merged.set(thread.id, thread)
      continue
    }

    const sqlitePaths = Array.from(new Set([...current.sqlitePaths, ...thread.sqlitePaths])).sort()
    const latest = thread.updated_at >= current.updated_at ? thread : current
    merged.set(thread.id, {
      ...latest,
      sqlitePaths,
    })
  }

  return Array.from(merged.values())
}

async function readSessionIndexTitles(): Promise<Record<string, string>> {
  if (!existsSync(SESSION_INDEX_PATH))
    return {}

  const titles: Record<string, { title: string, updatedAt: number }> = {}

  for (const line of (await readFile(SESSION_INDEX_PATH, 'utf-8')).split('\n')) {
    if (!line)
      continue

    const row = parseJSON(line)
    if (!row || typeof row !== 'object')
      continue

    const id = 'id' in row && typeof row.id === 'string' ? row.id : ''
    const title = 'thread_name' in row && typeof row.thread_name === 'string' ? row.thread_name.trim() : ''
    const updatedAt = 'updated_at' in row && typeof row.updated_at === 'string'
      ? Date.parse(row.updated_at)
      : 0

    if (!id || !title || !Number.isFinite(updatedAt))
      continue

    const current = titles[id]
    if (!current || updatedAt >= current.updatedAt)
      titles[id] = { title, updatedAt }
  }

  return Object.fromEntries(Object.entries(titles).map(([id, value]) => [id, value.title]))
}

function normalizeTitle(thread: ThreadData) {
  return thread.title
    .replace(/\n/g, ' ')
    .replace(thread.cwd, '')
    .replace(AGENTS_CONFIG.codex.path, '')
    .trim()
}
