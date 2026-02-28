import type { DetectResult, ThreadData } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import pLimit from 'p-limit'
import { join } from 'pathe'
import { rimraf } from 'rimraf'
import { writeJSON } from '../utils'
import { GLOBAL_STATE_PATH, HISTORY_FILE_PATH, SHELL_SNAPSHOTS_PATH } from './constants'
import { writeSQLite } from './db'

export async function deleteThread(thread: ThreadData) {
  const id = thread.id
  await rimraf(thread.rollout_path)
  await rimraf(join(SHELL_SNAPSHOTS_PATH, `${id}.sh`))
}

export async function deleteThreads({ threads, globalState, sqlitePath }: DetectResult) {
  const threadIds = new Set(threads.map(thread => thread.id))

  const limit = pLimit(5)
  await Promise.all(threads.map(thread => limit(() => deleteThread(thread))))

  updateGlobalState(threadIds, globalState)

  await updateHistory(HISTORY_FILE_PATH, Array.from(threadIds))

  if (sqlitePath)
    await writeSQLite(sqlitePath, Array.from(threadIds))
}

async function updateGlobalState(threadIds: Set<string>, globalState: DetectResult['globalState']) {
  for (const id of threadIds)
    delete globalState['thread-titles'].titles[id]
  globalState['thread-titles'].order = globalState['thread-titles'].order.filter(id => !threadIds.has(id))
  await writeJSON(GLOBAL_STATE_PATH, globalState)
}

async function updateHistory(path: string, ids: string[]) {
  const remove = new Set(ids)
  const rows = (await readFile(path, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(row => !remove.has(row?.session_id))

  const data = rows.length > 0
    ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n`
    : ''

  await writeFile(HISTORY_FILE_PATH, data, 'utf-8')
}
