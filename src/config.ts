import type { CommandOptions } from './types'
import { DEFAULT_OPTIONS } from './constants'

function normalizeConfig(options: Partial<CommandOptions>) {
  // interop
  if ('default' in options)
    options = options.default as Partial<CommandOptions>

  return options
}

export async function resolveConfig(options: Partial<CommandOptions>): Promise<CommandOptions> {
  const defaults = structuredClone(DEFAULT_OPTIONS)
  options = normalizeConfig(options)

  const merged = { ...defaults, ...options }

  return merged
}
