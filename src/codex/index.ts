import type { CommandOptions } from '../types'
import type { ThreadData } from './types'
import * as p from '@clack/prompts'
import c from 'ansis'
import { formatRelativeTime } from '../utils'
import { detectCodex } from './detect'

export async function promptCodex(_options: CommandOptions) {
  const data = await detectCodex()

  const result = await p.multiselect<ThreadData>({
    message: 'Select Codex threads to clean',
    options: data.map(thread => ({
      label: thread.title,
      hint: formatRelativeTime(thread.updated_at || thread.created_at),
      value: thread,
    })),
  })

  if (p.isCancel(result)) {
    p.outro(c.red('aborting'))
    return
  }

  // eslint-disable-next-line no-console
  console.log('promptCodex:', result)
}
