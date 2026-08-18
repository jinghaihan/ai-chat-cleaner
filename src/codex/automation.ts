import type { AutomationRunData } from './types'
import { createInterface } from 'node:readline'
import { x } from 'tinyexec'
import { glob } from 'tinyglobby'

const SQLITE_COLUMN_SEPARATOR = '\u001F'
const AUTOMATION_DATABASE_GLOBS = [
  'sqlite/codex.db',
  'sqlite/codex-dev.db',
]
const VISIBLE_AUTOMATION_RUN_STATUSES = [
  'IN_PROGRESS',
  'PENDING_REVIEW',
  'ACCEPTED',
  'ARCHIVED',
]
const AUTOMATION_RUN_COLUMNS_SQL = `
SELECT
  automation_runs.thread_id,
  CAST(automation_runs.created_at / 1000 AS INTEGER),
  CAST(automation_runs.updated_at / 1000 AS INTEGER),
  COALESCE(automation_runs.source_cwd, ''),
  REPLACE(REPLACE(REPLACE(
    COALESCE(NULLIF(automations.name, ''), NULLIF(automation_runs.thread_title, ''), automation_runs.thread_id),
    CHAR(31), ' '
  ), CHAR(13), ' '), CHAR(10), ' '),
  automation_runs.status
FROM automation_runs
JOIN automations ON automations.id = automation_runs.automation_id
WHERE automation_runs.status IN (${VISIBLE_AUTOMATION_RUN_STATUSES.map(quoteSQLiteString).join(', ')});
`.trim()

export async function getAutomationDatabasePaths(codexHome: string): Promise<string[]> {
  return glob(AUTOMATION_DATABASE_GLOBS, {
    cwd: codexHome,
    absolute: true,
    onlyFiles: true,
  })
}

export async function readAutomationRuns(filepath: string): Promise<AutomationRunData[]> {
  if (!await hasAutomationRunsTable(filepath))
    return []

  const proc = x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    '-separator',
    SQLITE_COLUMN_SEPARATOR,
    filepath,
    AUTOMATION_RUN_COLUMNS_SQL,
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

  const rows: AutomationRunData[] = []
  const output = createInterface({ input: process.stdout })

  for await (const line of output) {
    if (!line)
      continue
    rows.push(parseAutomationRunRow(line, filepath))
  }

  await waitForExit

  return rows
}

export async function deleteAutomationRuns(codexHome: string, threadIds: string[]) {
  const ids = Array.from(new Set(threadIds))
  if (ids.length === 0)
    return

  const databasePaths = await getAutomationDatabasePaths(codexHome)
  for (const filepath of databasePaths) {
    if (!await hasAutomationRunsTable(filepath))
      continue

    const sql = `
BEGIN IMMEDIATE;
DELETE FROM automation_runs
WHERE thread_id IN (${ids.map(quoteSQLiteString).join(', ')});
COMMIT;
`.trim()

    await x('sqlite3', [
      '-batch',
      '-cmd',
      '.timeout 5000',
      filepath,
      sql,
    ], { throwOnError: true })
  }
}

async function hasAutomationRunsTable(filepath: string) {
  const result = await x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    filepath,
    'SELECT COUNT(*) FROM sqlite_master WHERE type = \'table\' AND name = \'automation_runs\';',
  ], { throwOnError: true })

  return result.stdout.trim() === '1'
}

function parseAutomationRunRow(line: string, sqlitePath: string): AutomationRunData {
  const [id, createdAt, updatedAt, cwd, title, status, ...rest] = line.split(SQLITE_COLUMN_SEPARATOR)
  if (rest.length > 0)
    throw new Error(`Unexpected sqlite3 automation run row format: ${line}`)

  return {
    id,
    created_at: parseInteger(createdAt, 'created_at'),
    updated_at: parseInteger(updatedAt, 'updated_at'),
    cwd,
    title,
    status,
    sqlitePath,
  }
}

function parseInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed))
    return parsed
  throw new Error(`Invalid automation run ${field} value: ${value}`)
}

function quoteSQLiteString(value: string) {
  return `'${value.replaceAll('\'', '\'\'')}'`
}
