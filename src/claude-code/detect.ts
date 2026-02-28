import type { DetectResult, SessionIndexEntry, ThreadData } from './types'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'pathe'
import { glob } from 'tinyglobby'
import { normalizeInlineText, parseDateToUnix, parseJSON, toUnix } from '../utils'
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
      const rawTitle = session?.firstPrompt || meta.title || session?.summary || id

      threads.push({
        id,
        title: normalizeInlineText(rawTitle) || id,
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
      summaryTitle = normalizeInlineText(row.summary)

    if (!userTitle && row.type === 'user' && row.isMeta !== true) {
      const content = extractMessageText(row.message?.content)
      const normalized = normalizeInlineText(content)
      if (normalized)
        userTitle = normalized
    }

    if (userTitle && slug)
      break
  }

  return {
    title: userTitle || summaryTitle,
    slug: slug || undefined,
  }
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (!Array.isArray(content))
    return ''

  const texts: string[] = []
  for (const item of content) {
    if (typeof item === 'string') {
      texts.push(item)
      continue
    }
    if (!item || typeof item !== 'object')
      continue
    if (typeof item.text === 'string')
      texts.push(item.text)
    else if (typeof item.content === 'string')
      texts.push(item.content)
  }
  return texts.join(' ')
}

function decodeProjectName(projectName: string): string {
  if (!projectName)
    return ''
  if (projectName.startsWith('-'))
    return `/${projectName.slice(1).replaceAll('-', '/')}`
  return projectName.replaceAll('-', '/')
}
