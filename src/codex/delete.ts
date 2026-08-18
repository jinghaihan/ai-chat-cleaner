import type { ThreadData } from './types'
import { AGENTS_CONFIG } from '../constants'
import { deleteAutomationRuns } from './automation'
import { deleteCatalogEntries } from './catalog'
import { deleteCodexThreads } from './cli'

export async function deleteThreads(threads: ThreadData[]) {
  const ids = threads.map(thread => thread.id)

  // Codex Desktop stores sidebar and automation entries outside the thread state DB.
  // Delete those indexes even when the underlying thread is already gone.
  await deleteAutomationRuns(AGENTS_CONFIG.codex.path, ids)
  await deleteCatalogEntries(AGENTS_CONFIG.codex.path, ids)

  const localThreadIds = threads
    .filter(thread => !thread.isAutomationRunOnly && !thread.isCatalogOnly)
    .map(thread => thread.id)

  if (localThreadIds.length > 0)
    await deleteCodexThreads(localThreadIds)
}
