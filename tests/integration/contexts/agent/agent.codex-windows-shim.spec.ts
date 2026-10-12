import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
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

const npmPowerShellShim = String.raw`#!/usr/bin/env pwsh
$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent

$exe=""
if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {
  # Fix case when both the Windows and Linux builds of Node
  # are installed in the same directory
  $exe=".exe"
}
$ret=0
if (Test-Path "$basedir/node$exe") {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "$basedir/node$exe"  "$basedir/node_modules/@openai/codex/bin/codex.js" $args
  } else {
    & "$basedir/node$exe"  "$basedir/node_modules/@openai/codex/bin/codex.js" $args
  }
  $ret=$LASTEXITCODE
} else {
  # Support pipeline input
  if ($MyInvocation.ExpectingInput) {
    $input | & "node$exe"  "$basedir/node_modules/@openai/codex/bin/codex.js" $args
  } else {
    & "node$exe"  "$basedir/node_modules/@openai/codex/bin/codex.js" $args
  }
  $ret=$LASTEXITCODE
}
exit $ret
`

describe('Codex Windows npm launch boundary', () => {
  it.skipIf(process.platform !== 'win32')(
    'preserves custom script argv without cold-loading the Utility module',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'cc script 中文 $&-'))
      try {
        const modulePath = join(directory, 'resolver.mjs')
        await writeFile(modulePath, codexWindowsInvocation)
        const { createCodexWindowsScriptInvocation } = await import(pathToFileURL(modulePath).href)
        const executable = join(directory, 'codex.cmd')
        await writeFile(executable, '@echo off\r\nexit /b 99\r\n')
        // Observe the wrapper's real argv before it chooses how to invoke a native child.
        await writeFile(
          executable.replace(/\.cmd$/, '.ps1'),
          String.raw`[Console]::Out.WriteLine('UTILITY:' + [bool](Get-Module -Name Microsoft.PowerShell.Utility))
foreach ($argument in $args) {
  [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($argument)))
}
exit 0
`
        )
        const args = [
          '',
          '中文 $value & "quotes"\nnext line',
          'C:\\folder with spaces\\',
          '长提示 "quoted" '.repeat(1000),
          ''
        ]
        const invocation = createCodexWindowsScriptInvocation(
          executable,
          args,
          join(directory, 'private.argv')
        )
        const stdout = await new Promise<string>((resolve, reject) => {
          execFile(
            invocation.executable,
            invocation.args,
            { cwd: directory, timeout: 20_000, windowsHide: true },
            (error, output) => (error ? reject(error) : resolve(output))
          )
        })
        const lines = stdout.replace(/\r?\n$/, '').split(/\r?\n/)
        expect(lines.shift()).toBe('UTILITY:False')
        expect(lines.map((line) => Buffer.from(line, 'base64').toString('utf8'))).toEqual(args)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
    30_000
  )

  it.each(['.exe', '.com'])(
    'resolves native %s commands without a shell wrapper',
    async (extension) => {
      const directory = await mkdtemp(join(tmpdir(), 'cc native 中文 $&-'))
      try {
        const modulePath = join(directory, 'resolver.mjs')
        await writeFile(modulePath, codexWindowsInvocation)
        const { resolveCodexWindowsInvocation } = await import(pathToFileURL(modulePath).href)
        const workspace = join(directory, 'workspace')
        const binaryDirectory = join(directory, 'bin')
        await mkdir(workspace)
        await mkdir(binaryDirectory)
        const executable = join(binaryDirectory, `codex${extension}`)
        await writeFile(executable, '')
        const environment = { Path: `"${binaryDirectory}"` }
        for (const command of ['codex', `codex${extension}`, executable]) {
          expect(resolveCodexWindowsInvocation(command, workspace, environment)).toEqual({
            executable,
            prefix: []
          })
        }
        const directoryCandidate = join(directory, 'directory-candidate')
        await mkdir(directoryCandidate)
        await mkdir(join(directoryCandidate, `codex${extension}`))
        expect(
          resolveCodexWindowsInvocation('codex', workspace, {
            Path: `"${directoryCandidate}";"${binaryDirectory}"`
          })
        ).toEqual({ executable, prefix: [] })
        // Match PowerShell: cwd executables require an explicit path or a PATH entry.
        const localExecutable = join(workspace, `codex${extension}`)
        await writeFile(localExecutable, '')
        expect(resolveCodexWindowsInvocation('codex', workspace, environment)).toEqual({
          executable,
          prefix: []
        })
        expect(resolveCodexWindowsInvocation('codex', workspace, { Path: '' })).toBeNull()
        expect(
          resolveCodexWindowsInvocation(`.${sep}codex${extension}`, workspace, environment)
        ).toEqual({ executable: localExecutable, prefix: [] })
        await writeFile(join(directoryCandidate, 'codex.ps1'), '$env:MODEL="custom"\n')
        expect(
          resolveCodexWindowsInvocation('codex', workspace, {
            Path: `${directoryCandidate};${binaryDirectory}`
          })
        ).toBeNull()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    }
  )

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
      const companion = executable.replace(/\.cmd$/, '.ps1')
      await writeFile(companion, npmPowerShellShim.replaceAll('\n', '\r\n'))
      for (const command of ['codex', companion, executable]) {
        expect(resolveCodexWindowsInvocation(command, directory, { PATH: directory })).toEqual(
          result
        )
      }
      await writeFile(companion, npmPowerShellShim.replace('$ret=0', '$env:MODEL="custom"\n$ret=0'))
      expect(resolveCodexWindowsInvocation('codex', directory, { PATH: directory })).toBeNull()
      expect(resolveCodexWindowsInvocation(executable, directory, { PATH: directory })).toBeNull()
      await rm(companion)
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
