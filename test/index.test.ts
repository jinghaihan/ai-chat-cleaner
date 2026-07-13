import { describe, expect, it } from 'vitest'
import { findCodexExecutable, getCodexDeleteArgs } from '../src/codex/cli'

describe('should', () => {
  it('exported', () => {
    expect(1).toEqual(1)
  })
})

describe('codex CLI deletion', () => {
  it('uses the official forced deletion command', () => {
    expect(getCodexDeleteArgs('thread-1')).toEqual(['delete', '--force', 'thread-1'])
  })

  it('chooses the first executable that supports forced deletion', async () => {
    const probe = async (executable: string) => ({
      exitCode: executable === 'desktop-codex' ? 0 : 1,
      stdout: executable === 'desktop-codex' ? '  --force\n' : '',
    })

    await expect(
      findCodexExecutable(['missing-codex', 'desktop-codex'], probe),
    )
      .resolves
      .toBe('desktop-codex')
  })
})
