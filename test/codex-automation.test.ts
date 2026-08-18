import { execFile, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deleteAutomationRuns,
  getAutomationDatabasePaths,
  readAutomationRuns,
} from '../src/codex/automation'
import { detectCodex } from '../src/codex/detect'

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)
const hasSqlite3 = spawnSync('sqlite3', ['-version'], { windowsHide: true }).status === 0

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe.skipIf(!hasSqlite3)('codex Desktop automation runs', () => {
  it('discovers and reads visible automation runs', async () => {
    const { codexHome, databasePath } = await createCodexHome()
    await seedAutomationRuns(databasePath)

    await expect(getAutomationDatabasePaths(codexHome)).resolves.toEqual([databasePath])
    await expect(readAutomationRuns(databasePath)).resolves.toEqual([
      {
        id: 'run-1',
        created_at: 100,
        updated_at: 200,
        cwd: '/workspace/project',
        title: 'Daily inspection',
        status: 'PENDING_REVIEW',
        sqlitePath: databasePath,
      },
      {
        id: 'run-2',
        created_at: 300,
        updated_at: 400,
        cwd: '/workspace/project',
        title: 'Daily inspection',
        status: 'ACCEPTED',
        sqlitePath: databasePath,
      },
    ])
  })

  it('deletes only selected automation run records', async () => {
    const { codexHome, databasePath } = await createCodexHome()
    await seedAutomationRuns(databasePath)

    await deleteAutomationRuns(codexHome, ['run-1'])

    const remaining = await readAutomationRuns(databasePath)
    expect(remaining.map(run => run.id)).toEqual(['run-2'])
  })

  it('detects automation runs whose thread data is already gone', async () => {
    const { codexHome, databasePath } = await createCodexHome()
    await seedAutomationRuns(databasePath)

    const result = await detectCodex(codexHome)

    expect(result.threads).toHaveLength(2)
    expect(result.threads.map(thread => ({
      id: thread.id,
      isAutomationRunOnly: thread.isAutomationRunOnly,
      title: thread.title,
    }))).toEqual([
      {
        id: 'run-2',
        isAutomationRunOnly: true,
        title: 'Daily inspection',
      },
      {
        id: 'run-1',
        isAutomationRunOnly: true,
        title: 'Daily inspection',
      },
    ])
  })
})

async function createCodexHome() {
  const codexHome = await mkdtemp(join(tmpdir(), 'ai-chat-cleaner-'))
  temporaryDirectories.push(codexHome)
  const sqliteDirectory = join(codexHome, 'sqlite')
  const databasePath = join(sqliteDirectory, 'codex-dev.db')
  await mkdir(sqliteDirectory, { recursive: true })

  return { codexHome, databasePath }
}

async function seedAutomationRuns(databasePath: string) {
  await execFileAsync('sqlite3', [databasePath, `
CREATE TABLE automations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE automation_runs (
  thread_id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  status TEXT NOT NULL,
  thread_title TEXT,
  source_cwd TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO automations (id, name) VALUES ('daily-inspection', 'Daily inspection');
INSERT INTO automation_runs (
  thread_id, automation_id, status, thread_title, source_cwd, created_at, updated_at
) VALUES
  ('run-1', 'daily-inspection', 'PENDING_REVIEW', 'Old title', '/workspace/project', 100000, 200000),
  ('run-2', 'daily-inspection', 'ACCEPTED', 'Old title', '/workspace/project', 300000, 400000),
  ('hidden-run', 'daily-inspection', 'DELETED', 'Old title', '/workspace/project', 500000, 600000);
  `])
}
