import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { glob } from 'tinyglobby'

export interface HistoryReference {
  threadId: string
  baseThreadId: string
}

export interface HistoryDeletionPlan {
  dependentIds: string[]
  blockedIds: string[]
}

export async function readHistoryReferences(codexHome: string): Promise<HistoryReference[]> {
  const paths = await glob([
    'sessions/**/rollout-*.jsonl',
    'archived_sessions/**/rollout-*.jsonl',
  ], { cwd: codexHome, absolute: true, onlyFiles: true })

  const references: HistoryReference[] = []
  for (const path of paths) {
    const stream = createReadStream(path, { encoding: 'utf8' })
    const lines = createInterface({ input: stream })
    try {
      const firstLine = await lines[Symbol.asyncIterator]().next()
      if (!firstLine.done) {
        const entry = JSON.parse(firstLine.value)
        const threadId = entry?.payload?.id
        const baseThreadId = entry?.payload?.history_base?.thread_id
        if (typeof threadId === 'string' && typeof baseThreadId === 'string' && threadId !== baseThreadId)
          references.push({ threadId, baseThreadId })
      }
    }
    finally {
      lines.close()
      stream.destroy()
    }
  }

  return references
}

export function planHistoryDeletion(threadIds: string[], references: HistoryReference[]): HistoryDeletionPlan {
  const selected = new Set(threadIds)
  const children = new Map<string, Set<string>>()
  for (const { threadId, baseThreadId } of references) {
    const dependents = children.get(baseThreadId) ?? new Set<string>()
    dependents.add(threadId)
    children.set(baseThreadId, dependents)
  }

  const dependentIds = new Set<string>()
  const blockedIds: string[] = []
  function hasUnselectedDependent(threadId: string, visiting = new Set<string>()): boolean {
    if (visiting.has(threadId))
      throw new Error(`Cannot determine dependencies for ${threadId}: circular history references.`)
    visiting.add(threadId)
    let blocked = false
    for (const childId of children.get(threadId) ?? []) {
      if (!selected.has(childId)) {
        dependentIds.add(childId)
        blocked = true
      }
      if (hasUnselectedDependent(childId, visiting))
        blocked = true
    }
    visiting.delete(threadId)
    return blocked
  }

  for (const threadId of threadIds) {
    if (hasUnselectedDependent(threadId))
      blockedIds.push(threadId)
  }

  return { dependentIds: Array.from(dependentIds), blockedIds }
}

export function orderThreadsForDeletion(threadIds: string[], references: HistoryReference[]): string[] {
  const selected = new Set(threadIds)
  const children = new Map<string, Set<string>>()

  for (const { threadId, baseThreadId } of references) {
    if (!selected.has(baseThreadId))
      continue
    if (!selected.has(threadId)) {
      throw new Error(
        `Cannot delete ${baseThreadId}: forked chat ${threadId} still references its history. Select both chats to delete them together.`,
      )
    }
    const dependents = children.get(baseThreadId) ?? new Set<string>()
    dependents.add(threadId)
    children.set(baseThreadId, dependents)
  }

  const ordered: string[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  function visit(threadId: string) {
    if (visited.has(threadId))
      return
    if (visiting.has(threadId))
      throw new Error(`Cannot determine a safe deletion order for ${threadId}: circular history references.`)
    visiting.add(threadId)
    for (const childId of children.get(threadId) ?? [])
      visit(childId)
    visiting.delete(threadId)
    visited.add(threadId)
    ordered.push(threadId)
  }

  for (const threadId of threadIds)
    visit(threadId)

  return ordered
}
