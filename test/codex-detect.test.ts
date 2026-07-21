import type { ThreadData } from '../src/codex/types'
import { describe, expect, it } from 'vitest'
import { resolveThreadTitle } from '../src/codex/detect'

const thread: ThreadData = {
  id: 'thread-1',
  rollout_path: '/rollouts/thread-1.jsonl',
  created_at: 1,
  updated_at: 2,
  source: 'cli',
  model_provider: 'openai',
  cwd: '/workspace/project',
  title: '你看下 yy-1 分支能不能合并',
  sqlitePath: '/codex/state_5.sqlite',
  sqlitePaths: ['/codex/state_5.sqlite'],
}

describe('codex thread title resolution', () => {
  it('prefers the session index title shown in the Codex sidebar', () => {
    expect(resolveThreadTitle(thread, '合并袁园分支', '旧版标题'))
      .toBe('合并袁园分支')
  })

  it('falls back to the legacy display title before the SQLite title', () => {
    expect(resolveThreadTitle(thread, undefined, '旧版标题'))
      .toBe('旧版标题')
  })

  it('uses the SQLite title when no display title exists', () => {
    expect(resolveThreadTitle(thread))
      .toBe('你看下 yy-1 分支能不能合并')
  })
})
