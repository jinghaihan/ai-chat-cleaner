import type { ThreadData, ThreadGroup } from './types'
import { basename } from 'pathe'

export function groupCodexThreads(threads: ThreadData[]): ThreadGroup[] {
  const grouped = new Map<string, ThreadGroup>()

  for (const thread of threads) {
    const cwd = thread.cwd || ''
    const isChatgptWeb = !cwd && thread.sourceKind === 'chatgpt'
    const id = cwd || (isChatgptWeb ? '(chatgpt)' : '(unknown)')
    const label = cwd ? basename(cwd) : isChatgptWeb ? 'ChatGPT web' : '(unknown)'

    const group = grouped.get(id)
    if (group) {
      group.threads.push(thread)
      group.updatedAt = Math.max(group.updatedAt, thread.updated_at || thread.created_at || 0)
      continue
    }

    grouped.set(id, {
      id,
      label,
      cwd,
      path: isChatgptWeb ? '(ChatGPT web)' : undefined,
      threads: [thread],
      updatedAt: thread.updated_at || thread.created_at || 0,
    })
  }

  const groups = Array.from(grouped.values())

  for (const group of groups)
    group.threads.sort((a, b) => (b.updated_at || b.created_at || 0) - (a.updated_at || a.created_at || 0))

  groups.sort((a, b) => {
    const diff = b.updatedAt - a.updatedAt
    if (diff !== 0)
      return diff
    return a.label.localeCompare(b.label)
  })

  return groups
}
