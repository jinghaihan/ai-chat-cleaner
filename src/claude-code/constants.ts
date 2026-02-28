import { join } from 'pathe'
import { AGENTS_CONFIG } from '../constants'

export const ROOT_PATH = AGENTS_CONFIG['claude-code'].path
export const PROJECTS_PATH = join(ROOT_PATH, 'projects')
export const DEBUG_PATH = join(ROOT_PATH, 'debug')
export const TODOS_PATH = join(ROOT_PATH, 'todos')
export const SESSION_ENV_PATH = join(ROOT_PATH, 'session-env')
export const TASKS_PATH = join(ROOT_PATH, 'tasks')
export const FILE_HISTORY_PATH = join(ROOT_PATH, 'file-history')
export const PLANS_PATH = join(ROOT_PATH, 'plans')
export const AGENTS_PATH = join(ROOT_PATH, 'agents')
