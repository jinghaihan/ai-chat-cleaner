import { join } from 'pathe'
import { AGENTS } from '../constants'

export const GLOBAL_STATE_PATH = join(AGENTS.codex.path, '.codex-global-state.json')
export const HISTORY_FILE_PATH = join(AGENTS.codex.path, 'history.jsonl')
export const SHELL_SNAPSHOTS_PATH = join(AGENTS.codex.path, 'shell_snapshots')
