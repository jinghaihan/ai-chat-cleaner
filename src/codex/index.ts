import type { CommandOptions } from '../types'
import type { ThreadData } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { formatRelativeTime } from '../utils'
import { deleteThreads } from './delete'
import { detectCodex } from './detect'

export async function promptCodex(_options: CommandOptions) {
  const { threads, globalState, sqlitePath } = await detectCodex()

  const resolved = await p.multiselect<ThreadData>({
    message: `found ${c.yellow`${threads.length}`} threads`,
    options: threads.map(thread => ({
      label: thread.title,
      hint: formatRelativeTime(thread.updated_at || thread.created_at),
      value: thread,
    })),
  })

  if (p.isCancel(resolved)) {
    p.outro(c.red('aborting'))
    process.exit(1)
    return
  }

  await deleteThreads({
    threads: resolved,
    globalState,
    sqlitePath,
  })

  p.outro(`cleaned ${c.yellow`${resolved.length}`} threads`)
}
