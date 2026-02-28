import type { CommandOptions } from '../types'
import type { ThreadData, ThreadGroup } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { promptGroupedMultiSelect } from '../prompts'
import { formatRelativeTime } from '../utils'
import { deleteThreads } from './delete'
import { detectClaudeCode } from './detect'
import { groupClaudeCodeThreads } from './group'

export async function promptClaudeCode(_options: CommandOptions) {
  const spinner = p.spinner()
  spinner.start('detecting claude-code threads...')
  const { threads } = await detectClaudeCode()
  spinner.stop(`detected ${c.yellow`${threads.length}`} threads`)

  if (threads.length === 0) {
    p.outro(c.yellow('no threads found'))
    process.exit(0)
  }

  const grouped = groupClaudeCodeThreads(threads)
  const resolved = await promptGroupedMultiSelect<ThreadData>(formatThreadGroupOptions(grouped))

  if (resolved === null || resolved.length === 0) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  const confirmed = await p.confirm({
    message: `selected ${c.yellow`${resolved.length}`} records, continue?`,
    initialValue: true,
  })

  if (p.isCancel(confirmed) || !confirmed) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  await deleteThreads(resolved)

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
