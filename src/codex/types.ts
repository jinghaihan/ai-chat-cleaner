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
  source: 'cli' | 'vscode'
  model_provider: string
  cwd: string
  title: string
  sqlitePath: string
  sqlitePaths: string[]
}

export interface ThreadGroup {
  id: string
  label: string
  cwd: string
  threads: ThreadData[]
  updatedAt: number
}
