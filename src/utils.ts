import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

export const exec = promisify(execFile)

export async function readJSON(filepath: string) {
  if (!existsSync(filepath))
    return
  const content = await readFile(filepath, 'utf-8')
  return parseJSON(content)
}

export async function writeJSON(filepath: string, data: unknown) {
  const content = JSON.stringify(data, null, 2)
  await writeFile(filepath, content, 'utf-8')
}

export function parseJSON(value: string) {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

export function toUnix(value: number) {
  return Math.floor(value / 1000)
}

export function parseDateToUnix(value?: string) {
  if (!value)
    return 0
  const ts = Date.parse(value)
  if (!Number.isFinite(ts))
    return 0
  return Math.floor(ts / 1000)
}

export function formatRelativeTime(date: number) {
  const input = new Date(date * 1000)
  const diff = input.getTime() - Date.now()

  const seconds = Math.round(diff / 1000)
  const minutes = Math.round(seconds / 60)
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  const months = Math.round(days / 30)
  const years = Math.round(days / 365)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (Math.abs(seconds) < 60)
    return rtf.format(seconds, 'second')
  if (Math.abs(minutes) < 60)
    return rtf.format(minutes, 'minute')
  if (Math.abs(hours) < 24)
    return rtf.format(hours, 'hour')
  if (Math.abs(days) < 30)
    return rtf.format(days, 'day')
  if (Math.abs(months) < 12)
    return rtf.format(months, 'month')
  return rtf.format(years, 'year')
}

export function quoteSqlString(value: string) {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

export function normalizeInlineText(value: string) {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractMessageText(content: unknown): string {
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

export function isCommandTitle(title: string) {
  return /^\/[\w-]+(?:\s+[\w-]+)?$/.test(title)
}

export function isUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
