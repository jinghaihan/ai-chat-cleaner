import type { CAC } from 'cac'
import type { CommandOptions } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { resolveConfig } from './config'
import { NAME, VERSION } from './constants'

try {
  const cli: CAC = cac(NAME)

  cli
    .command('', 'Clean and remove AI chat with an interactive terminal UI')
    .allowUnknownOptions()
    .action(async (options: Partial<CommandOptions>) => {
      p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

      const config = await resolveConfig(options)

      console.log(config)
    })

  cli.help()
  cli.version(VERSION)
  cli.parse()
}
catch (error) {
  console.error(error)
  process.exit(1)
}
