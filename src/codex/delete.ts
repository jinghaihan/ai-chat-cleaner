import type { DetectResult, ThreadData } from './types'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import pLimit from 'p-limit'
import { join } from 'pathe'
import { rimraf } from 'rimraf'
import { parseJSON, writeJSON } from '../utils'
import { GLOBAL_STATE_PATH, HISTORY_FILE_PATH, SESSION_INDEX_PATH, SHELL_SNAPSHOTS_PATH } from './constants'
import { writeSQLite } from './db'

export async function deleteThread(thread: ThreadData) {
  const id = thread.id
  await rimraf(thread.rollout_path)
  await rimraf(join(SHELL_SNAPSHOTS_PATH, `${id}.sh`))
}

export async function deleteThreads({ threads, globalState }: DetectResult) {
  const threadIds = new Set(threads.map(thread => thread.id))

  const limit = pLimit(5)
  await Promise.all(threads.map(thread => limit(() => deleteThread(thread))))

  await updateGlobalState(threadIds, globalState)

  await updateHistory(HISTORY_FILE_PATH, Array.from(threadIds))
  await updateSessionIndex(SESSION_INDEX_PATH, threadIds)

  const idsBySqlitePath = groupThreadIdsBySqlitePath(threads)
  await Promise.all(Array.from(idsBySqlitePath, ([sqlitePath, ids]) => writeSQLite(sqlitePath, Array.from(ids))))
}

export function groupThreadIdsBySqlitePath(threads: ThreadData[]) {
  const grouped = new Map<string, Set<string>>()

  for (const thread of threads) {
    for (const sqlitePath of thread.sqlitePaths) {
      const ids = grouped.get(sqlitePath) ?? new Set<string>()
      ids.add(thread.id)
      grouped.set(sqlitePath, ids)
    }
  }

  return grouped
}

async function updateGlobalState(threadIds: Set<string>, globalState: DetectResult['globalState']) {
  if (!globalState || !globalState['thread-titles'])
    return
  for (const id of threadIds)
    delete globalState['thread-titles'].titles[id]
  globalState['thread-titles'].order = globalState['thread-titles'].order.filter(id => !threadIds.has(id))
  await writeJSON(GLOBAL_STATE_PATH, globalState)
}

async function updateHistory(path: string, ids: string[]) {
  if (!existsSync(path))
    return

  const remove = new Set(ids)
  const rows = (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(line => parseJSON(line))
    .filter(row => !remove.has(row?.session_id))

  const data = rows.length > 0
    ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
    : ''

  await writeFile(path, data, 'utf-8')
}

async function updateSessionIndex(path: string, threadIds: Set<string>) {
  if (!existsSync(path))
    return

  const rows = (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(line => parseJSON(line))
    .filter(row => !(row && typeof row === 'object' && 'id' in row && typeof row.id === 'string' && threadIds.has(row.id)))

  const data = rows.length > 0
    ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
    : ''

  await writeFile(path, data, 'utf-8')
}
