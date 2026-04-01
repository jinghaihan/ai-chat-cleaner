import type { ThreadData } from './types'
import { createInterface } from 'node:readline'
import { x } from 'tinyexec'
import { glob } from 'tinyglobby'
import { quoteSqlString } from '../utils'

const SQLITE_COLUMN_SEPARATOR = '\u001F'
const THREAD_TITLE_MAX_LENGTH = 240
const THREAD_TITLE_ELLIPSIS = '...'
const THREAD_TITLE_SLICE_LENGTH = THREAD_TITLE_MAX_LENGTH - THREAD_TITLE_ELLIPSIS.length
const THREAD_COLUMNS_SQL = `
SELECT
  id,
  rollout_path,
  created_at,
  updated_at,
  source,
  cwd,
  CASE
    WHEN LENGTH(${normalizeTitleSql('title')}) <= ${THREAD_TITLE_MAX_LENGTH}
      THEN ${normalizeTitleSql('title')}
    ELSE SUBSTR(${normalizeTitleSql('title')}, 1, ${THREAD_TITLE_SLICE_LENGTH}) || '${THREAD_TITLE_ELLIPSIS}'
  END AS title
FROM threads;
`.trim()

export async function readSQLite(filepath: string): Promise<ThreadData[]> {
  const proc = x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    '-separator',
    SQLITE_COLUMN_SEPARATOR,
    filepath,
    THREAD_COLUMNS_SQL,
  ])

  const process = proc.process
  if (!process?.stdout)
    throw new Error('Failed to start sqlite3 process')

  const stderrChunks: string[] = []
  const waitForExit = new Promise<void>((resolve, reject) => {
    process.once('error', reject)
    process.once('close', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const suffix = stderrChunks.join('').trim()
      const reason = signal
        ? `signal ${signal}`
        : `code ${code ?? 'unknown'}`

      reject(new Error(suffix ? `sqlite3 exited with ${reason}: ${suffix}` : `sqlite3 exited with ${reason}`))
    })
  })

  process.stderr?.setEncoding('utf8')
  process.stderr?.on('data', chunk => stderrChunks.push(chunk.toString()))

  const rows: ThreadData[] = []
  const output = createInterface({ input: process.stdout })

  for await (const line of output) {
    if (!line)
      continue
    rows.push(parseThreadRow(line))
  }

  await waitForExit

  return rows
}

export async function writeSQLite(filepath: string, ids: string[]) {
  if (ids.length === 0)
    return

  const values = ids.map(quoteSqlString).join(', ')
  await x('sqlite3', [
    filepath,
    `DELETE FROM threads WHERE id IN (${values});`,
  ], {
    throwOnError: true,
  })
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

function parseThreadRow(line: string): ThreadData {
  const [id, rollout_path, createdAt, updatedAt, source, cwd, title, ...rest] = line.split(SQLITE_COLUMN_SEPARATOR)
  if (rest.length > 0)
    throw new Error(`Unexpected sqlite3 row format: ${line}`)

  return {
    id,
    rollout_path,
    created_at: parseInteger(createdAt, 'created_at'),
    updated_at: parseInteger(updatedAt, 'updated_at'),
    source: source as ThreadData['source'],
    cwd,
    title,
  }
}

function parseInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed))
    return parsed
  throw new Error(`Invalid ${field} value: ${value}`)
}

function normalizeTitleSql(field: string) {
  return `REPLACE(REPLACE(REPLACE(${field}, CHAR(31), ' '), CHAR(13), ' '), CHAR(10), ' ')`
}
