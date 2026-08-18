import type { ThreadData } from './types'
import { AGENTS_CONFIG } from '../constants'
import { deleteAutomationRuns } from './automation'
import { deleteCodexThreads } from './cli'

export async function deleteThreads(threads: ThreadData[]) {
  const ids = threads.map(thread => thread.id)

  // Codex Desktop stores automation inbox entries outside the thread state DB.
  // Delete those first so orphaned runs remain cleanable even if their thread is gone.
  await deleteAutomationRuns(AGENTS_CONFIG.codex.path, ids)

  const localThreadIds = threads
    .filter(thread => !thread.isAutomationRunOnly)
    .map(thread => thread.id)

  if (localThreadIds.length > 0)
    await deleteCodexThreads(localThreadIds)
}
