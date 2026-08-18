export interface DetectResult {
  threads: ThreadData[]
  globalState?: Record<'thread-titles', ThreadTitles | undefined>
  sqlitePaths: string[]
}

export interface ThreadTitles {
  titles: Record<string, string>
  order: string[]
}

export interface ThreadData {
  id: string
  rollout_path: string
  created_at: number
  updated_at: number
  source: 'automation' | 'cli' | 'unknown' | 'vscode'
  model_provider: string
  cwd: string
  title: string
  sqlitePath: string
  sqlitePaths: string[]
  isAutomationRunOnly?: boolean
  automationRunStatus?: string
}

export interface AutomationRunData {
  id: string
  created_at: number
  updated_at: number
  cwd: string
  title: string
  status: string
  sqlitePath: string
}

export interface ThreadGroup {
  id: string
  label: string
  cwd: string
  threads: ThreadData[]
  updatedAt: number
}
