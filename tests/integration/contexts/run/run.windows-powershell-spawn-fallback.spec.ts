import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 as pathWin32 } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { createDeferred } from '../../../fixtures/deferred'

const fallbackMarker = 'CLEANCODE_WINDOWS_POWERSHELL_FALLBACK_OK'

describe.runIf(process.platform === 'win32')('Windows PowerShell spawn fallback', () => {
  it('retries a corrupt auto-selected pwsh with inbox PowerShell and never cmd', async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-powershell-fallback-'))
    const corruptPowerShell = join(workingDirectory, 'pwsh.exe')
    const inboxPowerShell = inboxWindowsPowerShellExecutable()
    const attemptedExecutables: string[] = []
    const exited = createDeferred<number | null>()
    let output = ''
    let adapter: NodePtyTerminalProcessAdapter | undefined

    try {
      await writeFile(corruptPowerShell, 'This file intentionally is not a Windows PE executable.')
      adapter = new NodePtyTerminalProcessAdapter({
        environment: process.env,
        resolveShellExecutable: async () => corruptPowerShell,
        runtimePlatform: 'win32',
        spawnPty: (executable, args, options) => {
          attemptedExecutables.push(executable)
          return spawnPtyProcess(executable, args, options)
        }
      })

      await withDeadline(
        adapter.start({
          scope: blockRunScope('windows-powershell-spawn-fallback'),
          workingDirectory,
          launchCommand: `[Console]::WriteLine('${fallbackMarker}'); exit 0`,
          launchMode: 'command',
          columns: 80,
          rows: 24,
          onOutput: (event) => {
            output += event.data
          },
          onExit: (event) => exited.resolve(event.exitCode)
        }),
        10_000,
        () =>
          `PowerShell fallback did not finish starting; attempts=${attemptedExecutables.join(', ')}`
      )

      await expect(
        withDeadline(
          exited.promise,
          20_000,
          () =>
            `PowerShell fallback did not exit; attempts=${attemptedExecutables.join(', ')}; output=${output}`
        )
      ).resolves.toBe(0)

      expect(output).toContain(fallbackMarker)
      expect(attemptedExecutables.map(pathWin32.normalize)).toEqual([
        pathWin32.normalize(corruptPowerShell),
        pathWin32.normalize(inboxPowerShell)
      ])
      expect(
        attemptedExecutables.some(
          (executable) => pathWin32.basename(executable).toLowerCase() === 'cmd.exe'
        )
      ).toBe(false)
    } finally {
      try {
        await adapter?.disposeAll()
      } finally {
        await rm(workingDirectory, { force: true, recursive: true })
      }
    }
  }, 35_000)
})

function inboxWindowsPowerShellExecutable(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return pathWin32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function blockRunScope(sessionId: string) {
  return {
    blockId: 'terminal-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-1', kind: 'block' as const },
    projectDirectory: 'C:\\project',
    projectId: 'project-test',
    runId: `run-${sessionId}`,
    sessionId,
    workspaceDirectory: 'C:\\project',
    workspaceId: 'main'
  }
}

async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  describeTimeout: () => string
): Promise<T> {
  let deadline: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    deadline = setTimeout(() => reject(new Error(describeTimeout())), timeoutMs)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(deadline)
  }
}
