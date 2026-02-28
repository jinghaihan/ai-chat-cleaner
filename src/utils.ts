import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'

export const exec = promisify(execFile)

export async function readJSON(filepath: string) {
  const content = await readFile(filepath, 'utf-8')
  return JSON.parse(content)
}

export async function writeJSON(filepath: string, data: unknown) {
  const content = JSON.stringify(data, null, 2)
  await writeFile(filepath, content, 'utf-8')
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
