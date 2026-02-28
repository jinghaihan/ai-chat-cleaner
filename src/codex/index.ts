import type { CommandOptions } from '../types'
import type { ThreadData, ThreadGroup } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { promptGroupedMultiSelect } from '../prompts'
import { formatRelativeTime } from '../utils'
import { deleteThreads } from './delete'
import { detectCodex } from './detect'
import { groupCodexThreads } from './group'

export async function promptCodex(_options: CommandOptions) {
  const { threads, globalState, sqlitePath } = await detectCodex()

  const grouped = groupCodexThreads(threads)
  const resolved = await promptGroupedMultiSelect<ThreadData>(formatThreadGroupOptions(grouped))

  if (resolved === null) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  if (resolved.length === 0) {
    p.outro(c.yellow('no threads selected'))
    return
  }

  const confirmed = await p.confirm({
    message: `Selected ${c.yellow`${resolved.length}`} records, continue?`,
    initialValue: true,
  })

  if (p.isCancel(confirmed) || !confirmed) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  await deleteThreads({
    threads: resolved,
    globalState,
    sqlitePath,
  })

  p.outro(`cleaned ${c.yellow`${resolved.length}`} threads`)
}

function formatThreadGroupOptions(grouped: ThreadGroup[]) {
  return grouped.map(group => ({
    id: group.id,
    label: group.label,
    path: group.cwd,
    items: group.threads.map(thread => ({
      id: thread.id,
      label: thread.title,
      hint: formatThreadHint(thread),
      value: thread,
    })),
  }))
}

function formatThreadHint(thread: ThreadData) {
  const updatedAt = thread.updated_at || thread.created_at
  const createdAt = thread.created_at || updatedAt
  return `updated ${formatRelativeTime(updatedAt)} · created ${formatRelativeTime(createdAt)}`
}
