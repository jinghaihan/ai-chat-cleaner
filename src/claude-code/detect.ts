import type { DetectResult, SessionIndexEntry, ThreadData } from './types'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'pathe'
import { glob } from 'tinyglobby'
import {
  extractMessageText,
  isCommandTitle,
  isUUID,
  normalizeInlineText,
  parseDateToUnix,
  parseJSON,
  toUnix,
} from '../utils'
import { ROOT_PATH } from './constants'

export async function detectClaudeCode(cwd = ROOT_PATH): Promise<DetectResult> {
  const projectsPath = join(cwd, 'projects')
  const projectDirs = await readProjectDirs(projectsPath)
  const threads: ThreadData[] = []

  for (const projectDir of projectDirs) {
    const sessions = await readSessionsIndex(projectDir)
    const files = await glob('*.jsonl', {
      cwd: projectDir,
      absolute: true,
      onlyFiles: true,
    })

    for (const file of files) {
      const id = basename(file, '.jsonl')
      if (id.startsWith('agent-'))
        continue

      const info = await stat(file).catch(() => null)
      if (!info)
        continue

      const session = sessions.get(id)
      const meta = await readThreadMeta(file)
      const updatedAt = parseDateToUnix(session?.modified) || toUnix(info.mtimeMs)
      const createdAt = parseDateToUnix(session?.created) || toUnix(info.birthtimeMs || info.ctimeMs || info.mtimeMs)
      const cwdPath = session?.projectPath || decodeProjectName(basename(projectDir))
      const title = pickTitle([
        session?.firstPrompt,
        meta.title,
        session?.summary,
      ])

      // Hide system-only / orphan rows that do not have a meaningful title.
      if (!title)
        continue

      threads.push({
        id,
        title,
        path: file,
        project_dir: projectDir,
        cwd: cwdPath,
        created_at: createdAt,
        updated_at: updatedAt,
        slug: meta.slug,
      })
    }
  }

  threads.sort((a, b) => b.updated_at - a.updated_at)

  return { threads }
}

async function readProjectDirs(projectsPath: string) {
  const entries = await readdir(projectsPath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => join(projectsPath, entry.name))
}

async function readSessionsIndex(projectDir: string) {
  const indexPath = join(projectDir, 'sessions-index.json')
  const raw = await readFile(indexPath, 'utf8').catch(() => '')
  if (!raw)
    return new Map<string, SessionIndexEntry>()

  const data = parseJSON(raw) as { entries?: SessionIndexEntry[] }
  const rows = Array.isArray(data?.entries) ? data.entries : []
  return new Map(rows.map(entry => [entry.sessionId, entry]))
}

async function readThreadMeta(path: string) {
  const raw = await readFile(path, 'utf8').catch(() => '')
  const lines = raw.split('\n').filter(Boolean)

  let userTitle = ''
  let summaryTitle = ''
  let slug = ''

  for (const line of lines) {
    const row = parseJSON(line)
    if (!row)
      continue

    if (!slug && typeof row.slug === 'string')
      slug = row.slug

    if (!summaryTitle && row.type === 'summary' && typeof row.summary === 'string')
      summaryTitle = normalizeIfValidTitle(row.summary)

    if (!userTitle && row.type === 'user' && row.isMeta !== true) {
      if (!isCommandEvent(row.message?.content)) {
        const content = extractMessageText(row.message?.content)
        userTitle = normalizeIfValidTitle(content)
      }
    }

    if (userTitle && summaryTitle && slug)
      break
  }

  return {
    title: userTitle || summaryTitle,
    slug: slug || undefined,
  }
}

function pickTitle(values: Array<string | undefined>) {
  for (const value of values) {
    const normalized = normalizeIfValidTitle(value)
    if (normalized)
      return normalized
  }
  return ''
}

function normalizeIfValidTitle(value: unknown) {
  if (typeof value !== 'string')
    return ''

  const normalized = normalizeInlineText(value)
  if (!normalized)
    return ''

  if (normalized.toLowerCase() === 'no prompt')
    return ''

  if (isUUID(normalized))
    return ''

  if (isCommandTitle(normalized))
    return ''

  return normalized
}

function isCommandEvent(content: unknown) {
  const source = extractMessageText(content)
  if (!source)
    return false

  return source.includes('<command-name>')
    || source.includes('<command-message>')
    || source.includes('<local-command-stdout>')
    || source.includes('<local-command-caveat>')
}

function decodeProjectName(projectName: string): string {
  if (!projectName)
    return ''
  if (projectName.startsWith('-'))
    return `/${projectName.slice(1).replaceAll('-', '/')}`
  return projectName.replaceAll('-', '/')
}
