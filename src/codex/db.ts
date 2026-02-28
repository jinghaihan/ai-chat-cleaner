import { exec } from '../utils'

export async function readSQLite<T = unknown>(filepath: string) {
  const { stdout } = await exec('sqlite3', [
    '-json',
    filepath,
    'SELECT * FROM threads;',
  ])
  return JSON.parse(stdout.trim()) as T
}
