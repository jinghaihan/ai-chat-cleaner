import type { DetectResult, ThreadData, ThreadTitles } from './types'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { AGENTS_CONFIG } from '../constants'
import { parseJSON, readJSON } from '../utils'
import { getAutomationDatabasePaths, readAutomationRuns } from './automation'
import { getCatalogDatabasePaths, readCatalogEntries } from './catalog'
import { GLOBAL_STATE_PATH, SESSION_INDEX_PATH } from './constants'
import { getDatabasePaths, readSQLite } from './db'

export async function detectCodex(cwd = AGENTS_CONFIG.codex.path): Promise<DetectResult> {
  const globalState = await readJSON(GLOBAL_STATE_PATH)
  const sqlitePaths = await getDatabasePaths(cwd)
  const automationDatabasePaths = await getAutomationDatabasePaths(cwd)
  const catalogDatabasePaths = await getCatalogDatabasePaths(cwd)
  const data = mergeThreads((await Promise.all(sqlitePaths.map(readSQLite))).flat())
  const threadIds = new Set(data.map(thread => thread.id))
  const orphanedCatalogEntries: ThreadData[] = mergeCatalogEntries(
    (await Promise.all(catalogDatabasePaths.map(readCatalogEntries))).flat(),
  )
    .filter(entry => !threadIds.has(entry.id))
    .map(entry => ({
      id: entry.id,
      rollout_path: '',
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      source: 'catalog' as const,
      model_provider: entry.model_provider,
      cwd: entry.cwd,
      title: entry.title,
      sqlitePath: entry.sqlitePath,
      sqlitePaths: [entry.sqlitePath],
      isCatalogOnly: true,
    }))
  const catalogEntryIds = new Set(orphanedCatalogEntries.map(entry => entry.id))
  const orphanedAutomationRuns: ThreadData[] = mergeAutomationRuns(
    (await Promise.all(automationDatabasePaths.map(readAutomationRuns))).flat(),
  )
    .filter(run => !threadIds.has(run.id) && !catalogEntryIds.has(run.id))
    .map(run => ({
      id: run.id,
      rollout_path: '',
      created_at: run.created_at,
      updated_at: run.updated_at,
      source: 'automation' as const,
      model_provider: 'openai',
      cwd: run.cwd,
      title: run.title,
      sqlitePath: run.sqlitePath,
      sqlitePaths: [run.sqlitePath],
      isAutomationRunOnly: true,
      automationRunStatus: run.status,
    }))
  const sessionIndexTitles = await readSessionIndexTitles()

  const threadTitles: ThreadTitles = globalState?.['thread-titles'] ?? {
    titles: {},
    order: [],
  }

  const legacyTitles = threadTitles.titles

  return {
    threads: [...data, ...orphanedCatalogEntries, ...orphanedAutomationRuns]
      .map((thread) => {
        const title = thread.isAutomationRunOnly || thread.isCatalogOnly
          ? thread.title
          : resolveThreadTitle(
              thread,
              sessionIndexTitles[thread.id],
              legacyTitles[thread.id],
            )
        return {
          ...thread,
          title,
        }
      })
      .filter(thread => thread.title)
      .sort((a, b) => a.updated_at > b.updated_at ? -1 : 1),
    globalState,
    sqlitePaths,
  }
}

function mergeCatalogEntries(entries: Awaited<ReturnType<typeof readCatalogEntries>>): Awaited<ReturnType<typeof readCatalogEntries>> {
  const merged = new Map<string, (typeof entries)[number]>()

  for (const entry of entries) {
    const current = merged.get(entry.id)
    if (!current || entry.updated_at >= current.updated_at)
      merged.set(entry.id, entry)
  }

  return Array.from(merged.values())
}

function mergeAutomationRuns(runs: Awaited<ReturnType<typeof readAutomationRuns>>): Awaited<ReturnType<typeof readAutomationRuns>> {
  const merged = new Map<string, (typeof runs)[number]>()

  for (const run of runs) {
    const current = merged.get(run.id)
    if (!current || run.updated_at >= current.updated_at)
      merged.set(run.id, run)
  }

  return Array.from(merged.values())
}

export function resolveThreadTitle(
  thread: ThreadData,
  sessionIndexTitle?: string,
  legacyTitle?: string,
) {
  // Codex's sidebar title is the latest thread_name appended to session_index.jsonl.
  // SQLite can still contain the initial user prompt after that display name changes.
  return sessionIndexTitle?.trim()
    || legacyTitle?.trim()
    || normalizeTitle(thread)
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
