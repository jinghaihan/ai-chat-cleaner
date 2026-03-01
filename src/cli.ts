import type { CommandOptions } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { cac } from 'cac'
import { promptClaudeCode } from './claude-code'
import { promptCodex } from './codex'
import { resolveConfig } from './config'
import { NAME, VERSION } from './constants'

async function main() {
  const cli = cac(NAME)

  cli
    .command('', 'Clean and remove AI chat with an interactive terminal UI')
    .option('--agent, -a <agent>', 'Agent to clean')
    .allowUnknownOptions()
    .action(async (options: Partial<CommandOptions>) => {
      p.intro(`${c.yellow`${NAME} `}${c.dim`v${VERSION}`}`)

      const config = await resolveConfig(options)

      switch (config.agents) {
        case 'codex': {
          await promptCodex(config)
          break
        }
        case 'claude-code': {
          await promptClaudeCode(config)
          break
        }
        default: {
          p.outro(`unknown agent: ${c.red(config.agents)}`)
          process.exit(1)
        }
      }
    })

  cli.help()
  cli.version(VERSION)
  cli.parse(process.argv, { run: false })
  await cli.runMatchedCommand()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
