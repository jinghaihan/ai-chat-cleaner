import type { ThreadData } from '../src/codex/types'
import { describe, expect, it } from 'vitest'
import { resolveThreadTitle } from '../src/codex/detect'
import { groupCodexThreads } from '../src/codex/group'

const thread: ThreadData = {
  id: 'thread-1',
  rollout_path: '/rollouts/thread-1.jsonl',
  created_at: 1,
  updated_at: 2,
  source: 'cli',
  model_provider: 'openai',
  cwd: '/workspace/project',
  title: 'Example thread title',
  sqlitePath: '/codex/state_5.sqlite',
  sqlitePaths: ['/codex/state_5.sqlite'],
}

describe('codex thread title resolution', () => {
  it('prefers the session index title shown in the Codex sidebar', () => {
    expect(resolveThreadTitle(thread, 'New display title', 'Legacy title'))
      .toBe('New display title')
  })

  it('falls back to the legacy display title before the SQLite title', () => {
    expect(resolveThreadTitle(thread, undefined, 'Legacy title'))
      .toBe('Legacy title')
  })

  it('uses the SQLite title when no display title exists', () => {
    expect(resolveThreadTitle(thread))
      .toBe('Example thread title')
  })
})

describe('codex thread grouping', () => {
  it('groups ChatGPT web records separately from threads with an unknown cwd', () => {
    const groups = groupCodexThreads([
      {
        ...thread,
        id: 'chatgpt-thread',
        updated_at: 3,
        cwd: '',
        source: 'catalog',
        sourceKind: 'chatgpt',
      },
      {
        ...thread,
        id: 'unknown-thread',
        cwd: '',
        source: 'catalog',
      },
    ])

    expect(groups.map(group => ({
      id: group.id,
      label: group.label,
      path: group.path,
    }))).toEqual([
      { id: '(chatgpt)', label: 'ChatGPT web', path: '(ChatGPT web)' },
      { id: '(unknown)', label: '(unknown)', path: undefined },
    ])
  })
})
