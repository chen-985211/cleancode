import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createTerminalOscColorResponse } from '../../../../src/contexts/run/infrastructure/terminal-model/terminalSourcePalette'
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

  it('starts an Agent job requested immediately after creating the PowerShell pty', async () => {
    let output = ''
    const started = createDeferred<void>()
    const exited = createDeferred<number | null>()

    await adapter.start({
      scope: agentRunScope('immediate-windows-agent-session'),
      workingDirectory,
      shell: 'powershell.exe',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })
    adapter.launchForegroundJob({
      args: ['-NoLogo', '-NoProfile', '-Command', "Write-Output 'immediate-agent-ready'"],
      environment: {},
      executable: 'powershell.exe',
      generation: 1,
      launchId: 'immediate-launch',
      onExit: (event) => exited.resolve(event.exitCode),
      onStarted: () => started.resolve(),
      sessionId: 'immediate-windows-agent-session'
    })

    await started.promise
    await waitUntil(() => output.includes('immediate-agent-ready'))
    await expect(exited.promise).resolves.toBe(0)
  }, 20_000)

  it('answers OSC 10/11 within the Codex startup deadline through ConPTY', async () => {
    let output = ''
    const exited = createDeferred<number | null>()

    await adapter.start({
      scope: agentRunScope('windows-agent-color-query'),
      workingDirectory,
      shell: 'powershell.exe',
      terminalSourceTheme: 'light',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })
    adapter.launchForegroundJob({
      args: ['-e', createWindowsColorProbeScript()],
      environment: {},
      executable: process.execPath,
      generation: 1,
      launchId: 'color-query-launch',
      onExit: (event) => exited.resolve(event.exitCode),
      onStarted: () => undefined,
      sessionId: 'windows-agent-color-query'
    })

    await waitUntil(() => output.includes('CLEANCODE_COLOR_PROBE:'))
    await expect(exited.promise).resolves.toBe(0)

    const response = Buffer.from(
      output.match(/CLEANCODE_COLOR_PROBE:([A-Za-z0-9+/=]+)/)?.[1] ?? '',
      'base64'
    ).toString('utf8')
    expect(response).toContain(createTerminalOscColorResponse(10, 'light'))
    expect(response).toContain(createTerminalOscColorResponse(11, 'light'))
    expect(output).not.toContain('\u001b]10;?')
    expect(output).not.toContain('\u001b]11;?')
  }, 20_000)

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
      terminalSourceTheme: 'light',
      environment: {
        term: 'outer-terminal',
        ColorTerm: 'outer-color',
        term_program: 'outer-program',
        colorfgbg: 'outer-palette',
        NO_COLOR: 'respect-no-color'
      },
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => {
        terminalExited = true
      }
    })
    adapter.write(
      'windows-agent-session',
      "[Console]::WriteLine(('outer:{0}|{1}|{2}|{3}|{4}' -f $env:TERM, $env:COLORTERM, $env:TERM_PROGRAM, $env:COLORFGBG, $env:NO_COLOR))\r"
    )
    await waitUntil(() =>
      output.includes('outer:xterm-256color|truecolor|cleancode|0;15|respect-no-color')
    )

    adapter.launchForegroundJob({
      args: [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        "[Console]::WriteLine('windows-agent-ready'); [Console]::WriteLine(('{0}|{1}|{2}|{3}|{4}' -f $env:TERM, $env:COLORTERM, $env:TERM_PROGRAM, $env:COLORFGBG, $env:NO_COLOR)); while ($true) { Start-Sleep -Milliseconds 100 }"
      ],
      environment: {
        CLEANCODE_TEST_SECRET: 'must-not-appear',
        Term: 'provider-terminal',
        colorterm: 'provider-color',
        term_program: 'provider-program',
        ColorFgBg: 'provider-palette'
      },
      executable: 'powershell.exe',
      generation: 1,
      launchId: 'launch-1',
      onExit: (event) => firstExit.resolve(event.exitCode),
      onStarted: () => firstStarted.resolve(),
      sessionId: 'windows-agent-session'
    })

    await firstStarted.promise
    await waitUntil(() => output.includes('windows-agent-ready'))
    await waitUntil(() =>
      output.includes('xterm-256color|truecolor|cleancode|0;15|respect-no-color')
    )
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
    workspaceId: 'main'
  }
}

function createWindowsColorProbeScript(): string {
  return [
    'process.stdin.setRawMode(true)',
    'process.stdin.resume()',
    'const chunks = []',
    'let completed = false',
    "const timeout = setTimeout(() => process.stdout.write('CLEANCODE_COLOR_PROBE_TIMEOUT\\n', () => process.exit(2)), 100)",
    'process.stdin.on("data", (chunk) => {',
    '  if (completed) return',
    '  chunks.push(chunk)',
    '  const response = Buffer.concat(chunks)',
    '  const text = response.toString("utf8")',
    '  if (!text.includes("\\x1b]10;rgb:") || !text.includes("\\x1b]11;rgb:")) return',
    '  completed = true',
    '  clearTimeout(timeout)',
    '  process.stdin.pause()',
    '  process.stdout.write(`CLEANCODE_COLOR_PROBE:${response.toString("base64")}\\n`, () => process.exit(0))',
    '})',
    'process.stdout.write("\\x1b]10;?\\x1b\\\\\\x1b]11;?\\x1b\\\\")'
  ].join(';')
}

async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Windows Agent PTY output.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
