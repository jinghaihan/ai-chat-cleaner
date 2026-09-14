import { join } from 'pathe'
import { x } from 'tinyexec'
import { isMacOS } from '../utils'

const CODEX_BUNDLE_ID = 'com.openai.codex'

export async function isCodexDesktopRunning() {
  if (!isMacOS)
    return false

  try {
    const { stdout } = await x('osascript', [
      '-e',
      `tell application id "${CODEX_BUNDLE_ID}" to return running`,
    ], { nodePath: false })
    return stdout.trim() === 'true'
  }
  catch {
    return false
  }
}

export async function quitCodexDesktop() {
  if (!isMacOS)
    return

  await x('osascript', [
    '-e',
    `tell application id "${CODEX_BUNDLE_ID}" to quit`,
  ], { nodePath: false, throwOnError: true })
}

export async function waitForCodexDesktopExit(threadIds: string[], codexHome: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (await isCodexDesktopRunning() || await hasActiveThreadLocks(threadIds, codexHome)) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for ChatGPT/Codex to quit.')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

export async function reopenCodexDesktop() {
  if (!isMacOS)
    return

  await x('open', ['-b', CODEX_BUNDLE_ID], { nodePath: false, throwOnError: true })
}

export async function hasActiveThreadLocks(threadIds: string[], codexHome: string) {
  for (const threadId of threadIds) {
    const lockPath = join(codexHome, 'thread-writer-locks', `${threadId}.lock`)
    try {
      const { stdout } = await x('lsof', ['-t', lockPath], { nodePath: false })
      if (stdout.trim())
        return true
    }
    catch {
      // lsof exits with code 1 when no process has the lock open.
    }
  }
  return false
}
