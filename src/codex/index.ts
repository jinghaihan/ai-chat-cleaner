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
  const spinner = p.spinner()
  spinner.start('detecting codex threads...')
  const { threads, globalState, sqlitePaths } = await detectCodex()
  spinner.stop(`detected ${c.yellow`${threads.length}`} threads`)

  if (threads.length === 0) {
    p.outro(c.yellow('no threads found'))
    process.exit(0)
  }

  const selectedProviders = await promptCodexProviders(threads)
  if (selectedProviders === null || selectedProviders.size === 0) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  const filteredThreads = threads.filter(thread => selectedProviders.has(thread.model_provider))
  const grouped = groupCodexThreads(filteredThreads)
  const resolved = await promptGroupedMultiSelect<ThreadData>(formatThreadGroupOptions(grouped))

  if (resolved === null || resolved.length === 0) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  const confirmed = await p.confirm({
    message: formatConfirmMessage(resolved.length, selectedProviders.size),
    initialValue: true,
  })

  if (p.isCancel(confirmed) || !confirmed) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  await deleteThreads({
    threads: resolved,
    globalState,
    sqlitePaths,
  })

  p.outro(`cleaned ${c.yellow`${resolved.length}`} threads`)
}

function formatConfirmMessage(threadCount: number, providerCount: number) {
  if (providerCount <= 1)
    return `selected ${c.yellow`${threadCount}`} records, continue?`
  return `selected ${c.yellow`${threadCount}`} records from ${c.yellow`${providerCount}`} providers, continue?`
}

async function promptCodexProviders(threads: ThreadData[]): Promise<Set<string> | null> {
  const providers = getProviderOptions(threads)
  if (providers.length <= 1)
    return new Set(providers.map(provider => provider.value))

  const selected = await p.multiselect({
    message: 'select Codex providers to clean',
    options: providers,
    initialValues: [providers[0]!.value],
    required: true,
  })

  if (p.isCancel(selected))
    return null

  return new Set(selected)
}

function getProviderOptions(threads: ThreadData[]) {
  const providers = new Map<string, { value: string, label: string, count: number, updatedAt: number }>()

  for (const thread of threads) {
    const value = thread.model_provider || 'unknown'
    const current = providers.get(value)
    const updatedAt = thread.updated_at || thread.created_at || 0
    if (current) {
      current.count += 1
      current.updatedAt = Math.max(current.updatedAt, updatedAt)
      continue
    }

    providers.set(value, {
      value,
      label: value,
      count: 1,
      updatedAt,
    })
  }

  return Array.from(providers.values())
    .sort((a, b) => {
      const diff = b.updatedAt - a.updatedAt
      if (diff !== 0)
        return diff
      return a.label.localeCompare(b.label)
    })
    .map(provider => ({
      value: provider.value,
      label: provider.label,
      hint: `${provider.count} threads`,
    }))
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
  return `${thread.model_provider} · updated ${formatRelativeTime(updatedAt)} · created ${formatRelativeTime(createdAt)}`
}
