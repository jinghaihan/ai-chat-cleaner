import type { CatalogEntryData } from './types'
import { x } from 'tinyexec'
import { glob } from 'tinyglobby'

const SQLITE_COLUMN_SEPARATOR = '\u001F'
const CATALOG_DATABASE_GLOBS = [
  'sqlite/codex.db',
  'sqlite/codex-dev.db',
]
const CATALOG_COLUMNS_SQL = `
SELECT
  thread_id,
  CAST(source_created_at AS INTEGER),
  CAST(CASE
    WHEN source_recency_at > source_updated_at THEN source_recency_at
    ELSE source_updated_at
  END AS INTEGER),
  COALESCE(cwd, ''),
  REPLACE(REPLACE(REPLACE(display_title, CHAR(31), ' '), CHAR(13), ' '), CHAR(10), ' '),
  COALESCE(source_kind, 'unknown'),
  COALESCE(model_provider, 'unknown')
FROM local_thread_catalog
WHERE missing_candidate = 0;
`.trim()

export async function getCatalogDatabasePaths(codexHome: string): Promise<string[]> {
  return glob(CATALOG_DATABASE_GLOBS, {
    cwd: codexHome,
    absolute: true,
    onlyFiles: true,
  })
}

export async function readCatalogEntries(filepath: string): Promise<CatalogEntryData[]> {
  if (!await hasTable(filepath, 'local_thread_catalog'))
    return []

  const result = await x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    '-separator',
    SQLITE_COLUMN_SEPARATOR,
    filepath,
    CATALOG_COLUMNS_SQL,
  ], { throwOnError: true })

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => parseCatalogEntryRow(line, filepath))
}

export async function deleteCatalogEntries(codexHome: string, threadIds: string[]) {
  const ids = Array.from(new Set(threadIds))
  if (ids.length === 0)
    return

  const databasePaths = await getCatalogDatabasePaths(codexHome)
  for (const filepath of databasePaths) {
    if (!await hasTable(filepath, 'local_thread_catalog'))
      continue

    const tableNames = new Set(await readTableNames(filepath))
    const idList = ids.map(quoteSQLiteString).join(', ')
    const statements = [
      'BEGIN IMMEDIATE;',
      ...(tableNames.has('thread_timeline_ledger')
        ? [`DELETE FROM thread_timeline_ledger WHERE thread_id IN (${idList});`]
        : []),
      ...(tableNames.has('inbox_items')
        ? [`DELETE FROM inbox_items WHERE thread_id IN (${idList});`]
        : []),
      `DELETE FROM local_thread_catalog WHERE thread_id IN (${idList});`,
      ...(tableNames.has('local_thread_catalog_metadata')
        ? ['UPDATE local_thread_catalog_metadata SET catalog_revision = catalog_revision + 1 WHERE id = 1;']
        : []),
      'COMMIT;',
    ]

    await x('sqlite3', [
      '-batch',
      '-cmd',
      '.timeout 5000',
      filepath,
      statements.join('\n'),
    ], { throwOnError: true })
  }
}

async function readTableNames(filepath: string) {
  const result = await x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    filepath,
    'SELECT name FROM sqlite_master WHERE type = \'table\';',
  ], { throwOnError: true })

  return result.stdout.split(/\r?\n/).filter(Boolean)
}

async function hasTable(filepath: string, tableName: string) {
  const result = await x('sqlite3', [
    '-batch',
    '-noheader',
    '-readonly',
    filepath,
    `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ${quoteSQLiteString(tableName)};`,
  ], { throwOnError: true })

  return result.stdout.trim() === '1'
}

function parseCatalogEntryRow(line: string, sqlitePath: string): CatalogEntryData {
  const [id, createdAt, updatedAt, cwd, title, source, modelProvider, ...rest] = line.split(SQLITE_COLUMN_SEPARATOR)
  if (rest.length > 0)
    throw new Error(`Unexpected sqlite3 catalog row format: ${line}`)

  return {
    id,
    created_at: parseInteger(createdAt, 'created_at'),
    updated_at: parseInteger(updatedAt, 'updated_at'),
    cwd,
    title,
    source,
    model_provider: modelProvider,
    sqlitePath,
  }
}

function parseInteger(value: string, field: string) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed))
    return parsed
  throw new Error(`Invalid catalog ${field} value: ${value}`)
}

function quoteSQLiteString(value: string) {
  return `'${value.replaceAll('\'', '\'\'')}'`
}
