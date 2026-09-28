import { existsSync } from 'node:fs'
import process from 'node:process'
import { join } from 'pathe'
import { x } from 'tinyexec'
import { glob } from 'tinyglobby'
import { AGENTS_CONFIG } from '../constants'
import { orderThreadsForDeletion, readHistoryReferences } from './history'

const CODEX_BIN_ENV = 'AI_CHAT_CLEANER_CODEX_BIN'
const DELETE_HELP_ARGS = ['delete', '--help']

interface CodexCommandResult {
  exitCode: number | undefined
  stdout: string
}

type CodexProbe = (executable: string) => Promise<CodexCommandResult>

export async function deleteCodexThreads(threadIds: string[]) {
  const orderedIds = orderThreadsForDeletion(
    threadIds,
    await readHistoryReferences(AGENTS_CONFIG.codex.path),
  )
  const executable = await resolveCodexExecutable()

  // Run in order: each invocation updates the same Codex state store.
  for (const id of orderedIds)
    await x(executable, getCodexDeleteArgs(id), { nodePath: false, throwOnError: true })
}

export function getCodexDeleteArgs(threadId: string) {
  return ['delete', '--force', threadId]
}

export async function resolveCodexExecutable() {
  const configured = process.env[CODEX_BIN_ENV]?.trim()
  const candidates = configured
    ? [configured]
    : [...await getDesktopCodexCandidates(), 'codex']

  try {
    return await findCodexExecutable(candidates, probeCodexExecutable)
  }
  catch {
    const source = configured
      ? `${CODEX_BIN_ENV} does not point to a compatible Codex executable`
      : 'Could not find a compatible Codex executable'
    throw new Error(`${source}. Update the Codex desktop app, install the Codex CLI, or set ${CODEX_BIN_ENV}.`)
  }
}

export async function findCodexExecutable(candidates: string[], probe: CodexProbe) {
  for (const executable of new Set(candidates.filter(Boolean))) {
    const result = await probe(executable)
    if (result.exitCode === 0 && result.stdout.includes('--force'))
      return executable
  }

  throw new Error('No compatible Codex executable found')
}

async function probeCodexExecutable(executable: string): Promise<CodexCommandResult> {
  try {
    return await x(executable, DELETE_HELP_ARGS, { nodePath: false })
  }
  catch {
    return { exitCode: undefined, stdout: '' }
  }
}

async function getDesktopCodexCandidates() {
  if (process.platform === 'darwin')
    return getMacDesktopCodexCandidates()
  if (process.platform === 'win32')
    return getWindowsDesktopCodexCandidates()
  return []
}

async function getMacDesktopCodexCandidates() {
  const appPaths = ['/Applications/ChatGPT.app', '/Applications/Codex.app']

  try {
    const { stdout } = await x('osascript', [
      '-e',
      'POSIX path of (path to application id "com.openai.codex")',
    ], { nodePath: false })
    const appPath = stdout.trim()
    if (appPath)
      appPaths.unshift(appPath)
  }
  catch {
    // The fallback locations above still cover the standard installations.
  }

  return Array.from(new Set(appPaths)).flatMap(getMacAppCodexCandidates)
}

export function getMacAppCodexCandidates(appPath: string) {
  const resources = join(appPath, 'Contents', 'Resources')
  return [
    join(resources, 'codex-cli', 'CodexCLI.app', 'Contents', 'MacOS', 'codex'),
    join(resources, 'codex-cli', 'bin', 'codex'),
    join(resources, 'codex'),
  ]
}

async function getWindowsDesktopCodexCandidates() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData)
    return []

  const codexBinDirectory = join(localAppData, 'OpenAI', 'Codex', 'bin')
  if (!existsSync(codexBinDirectory))
    return []

  return glob('**/codex.exe', {
    cwd: codexBinDirectory,
    absolute: true,
    onlyFiles: true,
  })
}
