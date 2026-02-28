import type { ThreadData } from './types'
import { readFile, writeFile } from 'node:fs/promises'
import pLimit from 'p-limit'
import { join } from 'pathe'
import { rimraf } from 'rimraf'
import { glob } from 'tinyglobby'
import { parseJSON } from '../utils'
import {
  AGENTS_PATH,
  DEBUG_PATH,
  FILE_HISTORY_PATH,
  PLANS_PATH,
  SESSION_ENV_PATH,
  TASKS_PATH,
  TODOS_PATH,
} from './constants'

export async function deleteThreads(threads: ThreadData[]) {
  const limit = pLimit(5)
  await Promise.all(threads.map(thread => limit(() => deleteThread(thread))))
}

async function deleteThread(thread: ThreadData) {
  await rimraf(thread.path)
  await rimraf(thread.path.replace(/\.jsonl$/i, ''))
  await rimraf(join(DEBUG_PATH, `${thread.id}.txt`))
  await rimraf(join(SESSION_ENV_PATH, thread.id))
  await rimraf(join(TASKS_PATH, thread.id))
  await rimraf(join(FILE_HISTORY_PATH, thread.id))

  if (thread.slug)
    await rimraf(join(PLANS_PATH, `${thread.slug}.md`))

  const todoFiles = await glob(`${thread.id}*.json`, {
    cwd: TODOS_PATH,
    absolute: true,
    onlyFiles: true,
  })
  await Promise.all(todoFiles.map(path => rimraf(path)))

  const agentIds = await readAgentIds(thread.path)
  await Promise.all(agentIds.map(agentId => rimraf(join(AGENTS_PATH, agentId, 'memory-local.md'))))

  await updateSessionsIndex(thread.project_dir, thread.id)
}

async function updateSessionsIndex(projectDir: string, threadId: string) {
  const path = join(projectDir, 'sessions-index.json')
  const raw = await readFile(path, 'utf8').catch(() => '')
  if (!raw)
    return

  const data = parseJSON(raw)
  if (!data || !Array.isArray(data.entries))
    return

  const nextEntries = data.entries.filter((entry: any) => entry?.sessionId !== threadId)
  if (nextEntries.length === data.entries.length)
    return

  data.entries = nextEntries
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

async function readAgentIds(path: string) {
  const raw = await readFile(path, 'utf8').catch(() => '')
  if (!raw)
    return []

  const ids = new Set<string>()
  const lines = raw.split('\n')

  for (const line of lines) {
    if (!line)
      continue
    const row = parseJSON(line)
    const value = row?.agent_id
    if (typeof value === 'string' && value)
      ids.add(value)
  }

  return Array.from(ids)
}
