import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import {
  createGeminiHookCommand,
  readGeminiSystemSettings
} from '../../../../src/contexts/agent/infrastructure/providers/gemini/GeminiLaunchSettings'

describe('Gemini launch policy and native hook shell', () => {
  it('retains JSONC policy and defaults without rewriting the source', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'gemini-policy-'))
    const path = join(directory, 'settings.json')
    const source = '{/* policy */"security":{"blocked":true,},"url":"https://host/a,//b",}'
    try {
      await writeFile(path, source)
      const result = await readGeminiSystemSettings(
        { GEMINI_CLI_SYSTEM_SETTINGS_PATH: path },
        process.platform
      )
      expect(result.settings).toEqual({ security: { blocked: true }, url: 'https://host/a,//b' })
      expect(result.defaults).toBe(join(directory, 'system-defaults.json'))
      expect(await readFile(path, 'utf8')).toBe(source)
      expect(
        (
          await readGeminiSystemSettings(
            { GEMINI_CLI_SYSTEM_SETTINGS_PATH: path, GEMINI_CLI_SYSTEM_DEFAULTS_PATH: '' },
            process.platform
          )
        ).defaults
      ).toBe(join(directory, 'system-defaults.json'))
      await writeFile(path, '{broken')
      await expect(
        readGeminiSystemSettings({ GEMINI_CLI_SYSTEM_SETTINGS_PATH: path }, process.platform)
      ).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('executes the hook with literal spaces, quotes and shell metacharacters on this OS', async () => {
    const directory = await mkdtemp(join(tmpdir(), "gemini hook '$&-"))
    const path = join(directory, '验证 relay.mjs')
    try {
      await writeFile(path, 'process.stdout.write("hook reached")')
      const command = createGeminiHookCommand(process.execPath, path, process.platform)
      const result = await promisify(execFile)(
        process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
        process.platform === 'win32'
          ? ['-NoProfile', '-NonInteractive', '-Command', command]
          : ['-c', command],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 5_000 }
      )
      expect(result.stdout).toBe('hook reached')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('quotes PowerShell paths without interpreting dollar or quote characters', () => {
    expect(
      createGeminiHookCommand(
        "C:\\Program Files\\User's $app\\node.exe",
        'C:\\临时\\relay.mjs',
        'win32'
      )
    ).toBe("& 'C:\\Program Files\\User''s $app\\node.exe' 'C:\\临时\\relay.mjs'")
  })
})
