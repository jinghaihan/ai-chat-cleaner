import type { CommandOptions } from '../types'
import type { ThreadData, ThreadGroup } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { AGENTS_CONFIG } from '../constants'
import { promptGroupedMultiSelect } from '../prompts'
import { formatRelativeTime, isMacOS } from '../utils'
import { deleteThreads } from './delete'
import { hasActiveThreadLocks, isCodexDesktopRunning, quitCodexDesktop, reopenCodexDesktop, waitForCodexDesktopExit } from './desktop'
import { detectCodex } from './detect'
import { groupCodexThreads } from './group'
import { planHistoryDeletion, readHistoryReferences } from './history'

export async function promptCodex(_options: CommandOptions) {
  const spinner = p.spinner()
  spinner.start('detecting codex threads...')
  const { threads } = await detectCodex()
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

  const localThreads = resolved.filter(thread => !thread.isAutomationRunOnly && !thread.isCatalogOnly)
  const historyPlan = localThreads.length > 0
    ? planHistoryDeletion(
        localThreads.map(thread => thread.id),
        await readHistoryReferences(AGENTS_CONFIG.codex.path),
      )
    : { dependentIds: [], blockedIds: [] }
  let additionalLocalThreadIds: string[] = []
  let selectedThreads = resolved

  if (historyPlan.dependentIds.length > 0) {
    const titleById = new Map(threads.map(thread => [thread.id, thread.title]))
    p.note(historyPlan.dependentIds
      .map(id => `${titleById.get(id) ?? 'Unknown chat'} (${id})`)
      .join('\n'), 'forked chats using selected history')

    const deleteDependents = await p.confirm({
      message: `Delete these ${historyPlan.dependentIds.length} forked chats too? Choose No to skip affected selected chats.`,
      initialValue: false,
    })

    if (p.isCancel(deleteDependents)) {
      p.outro(c.red('aborting'))
      process.exit(1)
    }

    if (deleteDependents) {
      additionalLocalThreadIds = historyPlan.dependentIds
    }
    else {
      const blockedIds = new Set(historyPlan.blockedIds)
      selectedThreads = resolved.filter(thread => !blockedIds.has(thread.id))
      if (selectedThreads.length === 0) {
        p.outro(c.yellow(`skipped ${blockedIds.size} chats; nothing deleted`))
        return
      }
    }
  }

  const localThreadIds = [
    ...selectedThreads
      .filter(thread => !thread.isAutomationRunOnly && !thread.isCatalogOnly)
      .map(thread => thread.id),
    ...additionalLocalThreadIds,
  ]
  let reopenDesktop = false

  try {
    if (localThreadIds.length > 0 && isMacOS) {
      const hasLocks = await hasActiveThreadLocks(
        localThreadIds,
        AGENTS_CONFIG.codex.path,
      )

      if (hasLocks && await isCodexDesktopRunning()) {
        const closeAndReopen = await p.confirm({
          message: 'ChatGPT/Codex is using the selected sessions. Quit it temporarily, delete them, and reopen it automatically?',
          initialValue: true,
        })

        if (p.isCancel(closeAndReopen) || !closeAndReopen) {
          p.outro(c.yellow('Please quit ChatGPT/Codex and run ai-chat-cleaner again.'))
          process.exit(1)
        }

        await quitCodexDesktop()
        reopenDesktop = true
        await waitForCodexDesktopExit(
          localThreadIds,
          AGENTS_CONFIG.codex.path,
        )
      }
    }
    await deleteThreads(selectedThreads, additionalLocalThreadIds)
  }
  catch (error) {
    p.outro(c.red('Deletion failed'))
    console.error(error)
    process.exitCode = 1
    return
  }
  finally {
    if (reopenDesktop)
      await reopenCodexDesktop()
  }

  const cleanedCount = selectedThreads.length + additionalLocalThreadIds.length
  const skippedCount = resolved.length - selectedThreads.length
  p.outro(`cleaned ${c.yellow`${cleanedCount}`} threads${skippedCount ? `; skipped ${skippedCount}` : ''}`)
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
    path: group.path ?? group.cwd,
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
  if (thread.isAutomationRunOnly) {
    const status = thread.automationRunStatus?.toLowerCase().replaceAll('_', ' ') ?? 'unknown'
    return `orphaned automation run · ${status} · updated ${formatRelativeTime(updatedAt)}`
  }
  if (thread.isCatalogOnly)
    return `orphaned desktop task · updated ${formatRelativeTime(updatedAt)}`
  return `${thread.model_provider} · updated ${formatRelativeTime(updatedAt)} · created ${formatRelativeTime(createdAt)}`
}
