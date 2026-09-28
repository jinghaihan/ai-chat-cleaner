import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { orderThreadsForDeletion, planHistoryDeletion, readHistoryReferences } from '../src/codex/history'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('codex history dependencies', () => {
  it('reads a forked chat history reference from its rollout', async () => {
    const home = await mkdtemp(join(tmpdir(), 'ai-chat-cleaner-history-'))
    tempDirs.push(home)
    const sessions = join(home, 'sessions', '2026', '09', '28')
    await mkdir(sessions, { recursive: true })
    await writeFile(join(sessions, 'rollout-child.jsonl'), `${JSON.stringify({
      type: 'session_meta',
      payload: { id: 'child', history_base: { thread_id: 'parent' } },
    })}\n${JSON.stringify({ type: 'event_msg', payload: {} })}\n`)

    expect(await readHistoryReferences(home)).toEqual([{ threadId: 'child', baseThreadId: 'parent' }])
  })

  it('rejects a parent-only deletion and orders selected descendants first', () => {
    const references = [
      { threadId: 'child', baseThreadId: 'parent' },
      { threadId: 'grandchild', baseThreadId: 'child' },
    ]

    expect(() => orderThreadsForDeletion(['parent'], references)).toThrow('forked chat child')
    expect(orderThreadsForDeletion(['parent', 'child', 'grandchild'], references))
      .toEqual(['grandchild', 'child', 'parent'])
  })

  it('identifies affected selections and dependent chats before deletion', () => {
    const references = [
      { threadId: 'child', baseThreadId: 'parent' },
      { threadId: 'grandchild', baseThreadId: 'child' },
    ]

    expect(planHistoryDeletion(['parent', 'independent'], references)).toEqual({
      dependentIds: ['child', 'grandchild'],
      blockedIds: ['parent'],
    })
    expect(planHistoryDeletion(['parent', 'child', 'independent'], references)).toEqual({
      dependentIds: ['grandchild'],
      blockedIds: ['parent', 'child'],
    })
  })
})
