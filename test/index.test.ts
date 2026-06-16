import type { ThreadData } from '../src/codex/types'
import { describe, expect, it } from 'vitest'
import { groupThreadIdsBySqlitePath } from '../src/codex/delete'

describe('should', () => {
  it('exported', () => {
    expect(1).toEqual(1)
  })
})

describe('codex sqlite deletion', () => {
  it('groups thread ids by every sqlite source path', () => {
    const grouped = groupThreadIdsBySqlitePath([
      createThread('thread-1', ['/codex/state_5.sqlite', '/codex/sqlite/state_5.sqlite']),
      createThread('thread-2', ['/codex/sqlite/state_5.sqlite']),
    ])

    expect(Object.fromEntries(Array.from(grouped, ([path, ids]) => [path, Array.from(ids)]))).toEqual({
      '/codex/state_5.sqlite': ['thread-1'],
      '/codex/sqlite/state_5.sqlite': ['thread-1', 'thread-2'],
    })
  })
})

function createThread(id: string, sqlitePaths: string[]): ThreadData {
  return {
    id,
    rollout_path: `/sessions/${id}.jsonl`,
    created_at: 1,
    updated_at: 1,
    source: 'vscode',
    cwd: '/repo',
    title: id,
    sqlitePath: sqlitePaths[0]!,
    sqlitePaths,
  }
}
