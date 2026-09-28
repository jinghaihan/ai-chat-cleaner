import type { ThreadData } from './types'
import { AGENTS_CONFIG } from '../constants'
import { deleteAutomationRuns } from './automation'
import { deleteCatalogEntries } from './catalog'
import { deleteCodexThreads } from './cli'

export async function deleteThreads(threads: ThreadData[], additionalLocalThreadIds: string[] = []) {
  const ids = Array.from(new Set([...threads.map(thread => thread.id), ...additionalLocalThreadIds]))

  const localThreadIds = Array.from(new Set([...threads
    .filter(thread => !thread.isAutomationRunOnly && !thread.isCatalogOnly)
    .map(thread => thread.id), ...additionalLocalThreadIds]))

  // Delete local sessions first. If Codex is still using one of them, keep the
  // secondary indexes intact so a failed delete cannot leave partial state.
  if (localThreadIds.length > 0)
    await deleteCodexThreads(localThreadIds)

  // Codex Desktop stores sidebar and automation entries outside the thread state DB.
  // Delete those indexes after the underlying sessions have been removed (or when
  // the selected records were already orphaned).
  await deleteAutomationRuns(AGENTS_CONFIG.codex.path, ids)
  await deleteCatalogEntries(AGENTS_CONFIG.codex.path, ids)
}
