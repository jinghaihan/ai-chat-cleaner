import type { ThreadData } from './types'
import { deleteCodexThreads } from './cli'

export async function deleteThreads(threads: ThreadData[]) {
  await deleteCodexThreads(threads.map(thread => thread.id))
}
