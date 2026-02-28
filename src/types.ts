import type { AGENTS_CHOICES } from './constants'

export interface CommandOptions {
  cwd?: string
}

export type AgentType = typeof AGENTS_CHOICES[number]

export interface AgentConfig {
  name: string
  dir: string
}
