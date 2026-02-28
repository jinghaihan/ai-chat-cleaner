import type { AgentType, CommandOptions, Options } from './types'
import process from 'node:process'
import * as p from '@clack/prompts'
import c from 'ansis'
import { AGENTS_CHOICES, AGENTS_CONFIG, DEFAULT_OPTIONS } from './constants'

function normalizeConfig(options: Partial<CommandOptions>) {
  // interop
  if ('default' in options)
    options = options.default as Partial<CommandOptions>

  return options
}

export async function resolveConfig(options: Partial<CommandOptions>): Promise<Options> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)

  const merged: CommandOptions = { ...defaults, ...options }

  const agents = AGENTS_CHOICES.find(agent => agent === options.agents)
  if (agents)
    merged.agents = agents
  else
    merged.agents = await resolveAgent()

  return merged as Options
}

async function resolveAgent(): Promise<AgentType> {
  const selected = await p.select({
    message: 'select agent to clean',
    options: AGENTS_CHOICES.map(agent => ({
      value: agent,
      label: AGENTS_CONFIG[agent].name,
      hint: AGENTS_CONFIG[agent].path,
    })),
  })

  if (p.isCancel(selected)) {
    p.outro(c.red('aborting'))
    process.exit(1)
  }

  return selected
}
