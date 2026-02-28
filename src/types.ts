import type { AGENTS_CHOICES } from './constants'

export interface CommandOptions {
  agents?: AgentType
}

export interface Options extends Required<CommandOptions> {}

export type AgentType = typeof AGENTS_CHOICES[number]

export interface AgentConfig {
  name: string
  path: string
}
