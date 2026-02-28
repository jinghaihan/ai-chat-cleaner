export interface DetectResult {
  threads: ThreadData[]
  globalState: Record<'thread-titles', ThreadTitles>
  sqlitePath: string | null
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
  cwd: string
  title: string
}
