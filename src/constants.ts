import type { AgentConfig, AgentType, CommandOptions } from './types'
import { homedir } from 'node:os'
import process from 'node:process'
import { join } from 'pathe'
import pkg from '../package.json'

export const NAME = pkg.name

export const VERSION = pkg.version

export const DEFAULT_OPTIONS: Partial<CommandOptions> = {}

export const AGENTS_CHOICES = ['codex', 'claude-code'] as const

export const AGENTS_CONFIG: Record<AgentType, AgentConfig> = {
  'codex': {
    name: 'codex',
    path: process.env.CODEX_HOME?.trim() || join(homedir(), '.codex'),
  },
  'claude-code': {
    name: 'claude-code',
    path: process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude'),
  },
}
