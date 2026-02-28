export interface DetectResult {
  threads: ThreadData[]
}

export interface ThreadData {
  id: string
  title: string
  path: string
  project_dir: string
  cwd: string
  created_at: number
  updated_at: number
  slug?: string
}

export interface ThreadGroup {
  id: string
  label: string
  cwd: string
  threads: ThreadData[]
  updatedAt: number
}

export interface SessionIndexEntry {
  sessionId: string
  projectPath?: string
  firstPrompt?: string
  summary?: string
  created?: string
  modified?: string
}
