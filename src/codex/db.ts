import { glob } from 'tinyglobby'
import { exec, parseJSON, quoteSqlString } from '../utils'

export async function readSQLite<T = unknown>(filepath: string) {
  const { stdout } = await exec('sqlite3', [
    '-json',
    filepath,
    'SELECT * FROM threads;',
  ])
  return parseJSON(stdout.trim()) as T
}

export async function writeSQLite(filepath: string, ids: string[]) {
  if (ids.length === 0)
    return

  const values = ids.map(quoteSqlString).join(', ')
  await exec('sqlite3', [
    filepath,
    `DELETE FROM threads WHERE id IN (${values});`,
  ])
}

export async function getDatabasePath(cwd: string): Promise<string | null> {
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
