import type { AgentConfig, AgentType, CommandOptions } from './types'
import { homedir } from 'node:os'
import { join } from 'pathe'
import pkg from '../package.json'

export const NAME = pkg.name

export const VERSION = pkg.version

export const DEFAULT_OPTIONS: Partial<CommandOptions> = {}

export const AGENTS_CHOICES = ['codex'] as const

export const AGENTS: Record<AgentType, AgentConfig> = {
  codex: {
    name: 'codex',
    dir: join(homedir(), '.codex'),
  },
}
