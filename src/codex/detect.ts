import type { DetectResult, ThreadData, ThreadTitles } from './types'
import { AGENTS } from '../constants'
import { readJSON } from '../utils'
import { GLOBAL_STATE_PATH } from './constants'
import { getDatabasePath, readSQLite } from './db'

export async function detectCodex(cwd = AGENTS.codex.path): Promise<DetectResult> {
  const globalState = await readJSON(GLOBAL_STATE_PATH)
  const sqlitePath = await getDatabasePath(cwd)
  const data = sqlitePath ? await readSQLite<ThreadData[]>(sqlitePath) : []

  const threadTitles: ThreadTitles = globalState['thread-titles']

  const titles = threadTitles.titles
  const order = threadTitles.order

  return {
    threads: order.map((id) => {
      const item = data.find(i => i.id === id)!
      const title = titles[id] || item?.title || 'Untitled Thread'
      return { ...item, title }
    }),
    globalState,
    sqlitePath,
  }
}
