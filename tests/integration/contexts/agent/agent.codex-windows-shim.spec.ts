import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { codexWindowsInvocation } from '../../../../src/contexts/agent/infrastructure/providers/codex/CodexWindowsInvocation'

// An actual npm cmd-shim output. Changing wrapper semantics must defeat recognition.
const npmShim = String.raw`@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\node.exe" (
  SET "_prog=%dp0%\node.exe"
) ELSE (
  SET "_prog=node"
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*
`

describe('Codex Windows npm launch boundary', () => {
  it('recognizes only the complete standard shim and keeps long literal argv out of cmd', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cc npm 中文 $&-'))
    try {
      const modulePath = join(directory, 'resolver.mjs')
      await writeFile(modulePath, codexWindowsInvocation)
      const { resolveCodexWindowsInvocation } = await import(pathToFileURL(modulePath).href)
      const executable = join(directory, 'codex.cmd')
      const packageDirectory = join(directory, 'node_modules', '@openai', 'codex')
      const entry = join(packageDirectory, 'bin', 'codex.js')
      await mkdir(join(packageDirectory, 'bin'), { recursive: true })
      await writeFile(entry, '#!/usr/bin/env node\n')
      await writeFile(
        join(packageDirectory, 'package.json'),
        JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } })
      )
      const node = join(directory, 'node.exe')
      await writeFile(node, '')
      await writeFile(executable, npmShim.replaceAll('\n', '\r\n'))
      const result = resolveCodexWindowsInvocation(executable, directory, { PATH: directory })
      const instruction = '中文 $value & "quotes" '.repeat(1000)
      expect([result.executable, ...result.prefix, instruction]).toEqual([node, entry, instruction])
      expect(instruction.length).toBeGreaterThan(8191)
      expect(await readFile(executable, 'utf8')).toBe(npmShim.replaceAll('\n', '\r\n'))
      // Preserve a user's custom environment changes and any alternate package.
      await writeFile(executable, npmShim.replace('SETLOCAL', 'SETLOCAL\nSET MODEL=custom'))
      expect(resolveCodexWindowsInvocation(executable, directory, { PATH: directory })).toBeNull()
      await writeFile(executable, npmShim.replace('@openai\\codex', 'other\\codex'))
      expect(resolveCodexWindowsInvocation(executable, directory, { PATH: directory })).toBeNull()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
