import type { DetectResult, ThreadData, ThreadTitles } from './types'
import { glob } from 'tinyglobby'
import { AGENTS } from '../constants'
import { readJSON } from '../utils'
import { GLOBAL_STATE_PATH } from './constants'
import { readSQLite } from './db'

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
  }
}

async function getDatabasePath(cwd: string): Promise<string | null> {
  const files = await glob('state_*.sqlite', {
    cwd,
    absolute: true,
    onlyFiles: true,
  })

  const latest = files
    .filter(file => /state_\d+\.sqlite$/i.test(file))
    .sort((a, b) => extractVersion(b) - extractVersion(a))[0]

  return latest || null
}

function extractVersion(path: string): number {
  const matched = path.match(/state_(\d+)\.sqlite$/i)
  if (!matched)
    return 0
  const version = Number.parseInt(matched[1], 10)
  return Number.isFinite(version) ? version : 0
}
