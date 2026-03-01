import type { DetectResult, ThreadData, ThreadTitles } from './types'
import { AGENTS_CONFIG } from '../constants'
import { readJSON } from '../utils'
import { GLOBAL_STATE_PATH } from './constants'
import { getDatabasePath, readSQLite } from './db'

export async function detectCodex(cwd = AGENTS_CONFIG.codex.path): Promise<DetectResult> {
  const globalState = await readJSON(GLOBAL_STATE_PATH)
  const sqlitePath = await getDatabasePath(cwd)
  const data = sqlitePath ? await readSQLite<ThreadData[]>(sqlitePath) : []

  const threadTitles: ThreadTitles = globalState?.['thread-titles'] ?? {
    titles: {},
    order: [],
  }

  const titles = threadTitles.titles

  return {
    threads: data
      .filter(i => i.title || i.id in titles)
      .sort((a, b) => a.updated_at > b.updated_at ? -1 : 1)
      .map((thread) => {
        const title = titles[thread.id] || normalizeTitle(thread)
        return {
          ...thread,
          title,
        }
      }),
    globalState,
    sqlitePath,
  }
}

function normalizeTitle(thread: ThreadData) {
  return thread.title
    .replace(/\n/g, ' ')
    .replace(thread.cwd, '')
    .replace(AGENTS_CONFIG.codex.path, '')
    .trim()
}
