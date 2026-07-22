import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { createDeferred } from '../../../fixtures/deferred'

describe.runIf(process.platform === 'win32')('Windows Agent pty terminal process adapter', () => {
  let adapter: NodePtyTerminalProcessAdapter
  let workingDirectory: string

  beforeEach(async () => {
    adapter = new NodePtyTerminalProcessAdapter()
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-windows-agent-pty-'))
  })

  afterEach(async () => {
    await adapter.disposeAll()
    await rm(workingDirectory, { force: true, recursive: true })
  })

  it('interrupts only the Agent job, reports exit, and keeps PowerShell writable', async () => {
    let output = ''
    let terminalExited = false
    const firstStarted = createDeferred<void>()
    const firstExit = createDeferred<number | null>()
    const secondExit = createDeferred<number | null>()

    await adapter.start({
      scope: agentRunScope('windows-agent-session'),
      workingDirectory,
      shell: 'powershell.exe',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => {
        terminalExited = true
      }
    })

    adapter.launchForegroundJob({
      args: [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        "[Console]::WriteLine('windows-agent-ready'); while ($true) { Start-Sleep -Milliseconds 100 }"
      ],
      environment: { CLEANCODE_TEST_SECRET: 'must-not-appear' },
      executable: 'powershell.exe',
      generation: 1,
      launchId: 'launch-1',
      onExit: (event) => firstExit.resolve(event.exitCode),
      onStarted: () => firstStarted.resolve(),
      sessionId: 'windows-agent-session'
    })

    await firstStarted.promise
    await waitUntil(() => output.includes('windows-agent-ready'))
    adapter.write('windows-agent-session', '\x03')
    await firstExit.promise

    adapter.launchForegroundJob({
      args: ['-NoLogo', '-NoProfile', '-Command', 'exit 7'],
      environment: {},
      executable: 'powershell.exe',
      generation: 2,
      launchId: 'launch-2',
      onExit: (event) => secondExit.resolve(event.exitCode),
      onStarted: () => undefined,
      sessionId: 'windows-agent-session'
    })

    await expect(secondExit.promise).resolves.toBe(7)
    adapter.write('windows-agent-session', "Write-Output 'shell-still-running'\r")
    await waitUntil(() => output.includes('shell-still-running'))

    expect(terminalExited).toBe(false)
    expect(output).not.toContain('must-not-appear')
    expect(output).not.toContain('\x1eCLEANCODE_JOB:')
    expect(output).not.toContain('CLEANCODE_JOB:')
    expect(output).not.toContain('cleancode-agent-job-')
    expect(output).not.toContain('launch.ps1')
  }, 20_000)
})

function agentRunScope(sessionId: string) {
  return {
    blockId: 'agent-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'agent-1', kind: 'agent' as const },
    projectDirectory: 'C:\\project',
    projectId: 'project-test',
    runId: `run-${sessionId}`,
    sessionId,
    workspaceDirectory: 'C:\\project',
    workspaceName: 'main'
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Windows Agent PTY output.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
