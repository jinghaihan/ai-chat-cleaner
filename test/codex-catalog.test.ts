import { execFile, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteCatalogEntries,
  getCatalogDatabasePaths,
  readCatalogEntries,
} from '../src/codex/catalog'
import { detectCodex } from '../src/codex/detect'

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)
const hasSqlite3 = spawnSync('sqlite3', ['-version'], { windowsHide: true }).status === 0

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe.skipIf(!hasSqlite3)('codex Desktop thread catalog', () => {
  it('reads only catalog entries visible in the sidebar', async () => {
    const { codexHome, catalogPath } = await createCodexHome()
    await seedCatalog(catalogPath)

    await expect(getCatalogDatabasePaths(codexHome)).resolves.toEqual([catalogPath])
    await expect(readCatalogEntries(catalogPath)).resolves.toEqual([
      {
        id: 'catalog-only',
        created_at: 100,
        updated_at: 250,
        cwd: '/workspace/project',
        title: 'Orphaned desktop task',
        source: 'vscode',
        model_provider: 'openai',
        sqlitePath: catalogPath,
      },
      {
        id: 'live-thread',
        created_at: 300,
        updated_at: 400,
        cwd: '/workspace/project',
        title: 'Live task',
        source: 'vscode',
        model_provider: 'openai',
        sqlitePath: catalogPath,
      },
    ])
  })

  it('deletes selected catalog records and their secondary indexes', async () => {
    const { codexHome, catalogPath } = await createCodexHome()
    await seedCatalog(catalogPath)

    await deleteCatalogEntries(codexHome, ['catalog-only'])

    await expect(readCatalogEntries(catalogPath)).resolves.toHaveLength(1)
    await expect(queryScalar(catalogPath, 'SELECT COUNT(*) FROM thread_timeline_ledger WHERE thread_id = \'catalog-only\';'))
      .resolves
      .toBe('0')
    await expect(queryScalar(catalogPath, 'SELECT COUNT(*) FROM inbox_items WHERE thread_id = \'catalog-only\';'))
      .resolves
      .toBe('0')
    await expect(queryScalar(catalogPath, 'SELECT catalog_revision FROM local_thread_catalog_metadata WHERE id = 1;'))
      .resolves
      .toBe('8')
  })

  it('detects visible catalog entries whose thread data is gone', async () => {
    const { codexHome, catalogPath, statePath } = await createCodexHome()
    await seedCatalog(catalogPath)
    await seedThreadState(statePath)

    const result = await detectCodex(codexHome)

    expect(result.threads.map(thread => ({
      id: thread.id,
      isCatalogOnly: thread.isCatalogOnly,
      title: thread.title,
    }))).toEqual([
      {
        id: 'live-thread',
        isCatalogOnly: undefined,
        title: 'Live task',
      },
      {
        id: 'catalog-only',
        isCatalogOnly: true,
        title: 'Orphaned desktop task',
      },
    ])
  })
})

async function createCodexHome() {
  const codexHome = await mkdtemp(join(tmpdir(), 'ai-chat-cleaner-'))
  temporaryDirectories.push(codexHome)
  const sqliteDirectory = join(codexHome, 'sqlite')
  await mkdir(sqliteDirectory, { recursive: true })

  return {
    codexHome,
    catalogPath: join(sqliteDirectory, 'codex-dev.db'),
    statePath: join(codexHome, 'state_5.sqlite'),
  }
}

async function seedCatalog(databasePath: string) {
  await execFileAsync('sqlite3', [databasePath, `
CREATE TABLE local_thread_catalog (
  host_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  display_title TEXT NOT NULL,
  source_created_at REAL NOT NULL,
  source_updated_at REAL NOT NULL,
  cwd TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  missing_candidate INTEGER NOT NULL DEFAULT 0,
  source_recency_at REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (host_id, thread_id)
);
CREATE TABLE local_thread_catalog_metadata (
  id INTEGER PRIMARY KEY,
  catalog_revision INTEGER NOT NULL
);
CREATE TABLE thread_timeline_ledger (
  host_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  record_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (host_id, thread_id, sequence)
);
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  thread_id TEXT
);
INSERT INTO local_thread_catalog_metadata VALUES (1, 7);
INSERT INTO local_thread_catalog VALUES
  ('local', 'catalog-only', 'Orphaned desktop task', 100, 200, '/workspace/project', 'vscode', 'openai', 0, 250),
  ('local', 'live-thread', 'Live task', 300, 400, '/workspace/project', 'vscode', 'openai', 0, 350),
  ('local', 'hidden-entry', 'Hidden task', 500, 600, '/workspace/project', 'vscode', 'openai', 1, 600);
INSERT INTO thread_timeline_ledger VALUES ('local', 'catalog-only', 1, 'record-1', '{}');
INSERT INTO inbox_items VALUES ('inbox-1', 'catalog-only');
  `])
}

async function seedThreadState(databasePath: string) {
  await execFileAsync('sqlite3', [databasePath, `
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  rollout_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  model_provider TEXT NOT NULL,
  cwd TEXT NOT NULL,
  title TEXT NOT NULL
);
INSERT INTO threads VALUES (
  'live-thread', '/rollouts/live-thread.jsonl', 300, 400,
  'vscode', 'openai', '/workspace/project', 'Live task'
);
  `])
}

async function queryScalar(databasePath: string, sql: string) {
  const result = await execFileAsync('sqlite3', ['-batch', '-noheader', databasePath, sql])
  return result.stdout.trim()
}
