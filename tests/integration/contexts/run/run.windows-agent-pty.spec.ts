import { existsSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 as pathWin32 } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { createTerminalProcessEnvironment } from '../../../../src/contexts/run/infrastructure/pty/TerminalProcessEnvironment'
import { resolveTerminalShellExecutable } from '../../../../src/contexts/run/infrastructure/pty/TerminalShellExecutableResolver'
import { WindowsConptyWarmup } from '../../../../src/contexts/run/infrastructure/pty/WindowsConptyWarmup'
import { createDeferred } from '../../../fixtures/deferred'

describe.runIf(process.platform === 'win32')('Windows Agent pty terminal process adapter', () => {
  let adapter: NodePtyTerminalProcessAdapter
  let model: HeadlessTerminalModelAdapter
  let workingDirectory: string

  beforeEach(async () => {
    adapter = new NodePtyTerminalProcessAdapter()
    model = new HeadlessTerminalModelAdapter()
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-windows-agent-pty-'))
  })

  afterEach(async () => {
    await adapter.disposeAll()
    model.disposeAll()
    await rm(workingDirectory, { force: true, recursive: true })
  })

  it('lets the hidden PowerShell ConPTY warmup exit naturally', async () => {
    const exited = createDeferred<void>()
    let killCount = 0
    const warmup = new WindowsConptyWarmup({
      environment: createTerminalProcessEnvironment({
        explicit: undefined,
        inherited: process.env,
        platform: 'win32'
      }),
      resolvePowerShellExecutable: () =>
        resolveTerminalShellExecutable({
          platform: 'win32',
          resolveAppExecutionAlias: () => null
        }),
      runtimePlatform: 'win32',
      spawnPty: (executable, args, options) => {
        const process = spawnPtyProcess(executable, args, options)
        process.onExit(() => exited.resolve())
        return {
          kill: () => {
            killCount += 1
            process.kill()
          },
          onExit: (listener) => process.onExit(listener)
        }
      },
      timeoutMs: 5_000,
      workingDirectory
    })

    try {
      warmup.start()
      await exited.promise
      expect(killCount).toBe(0)
    } finally {
      warmup.dispose()
    }
  }, 20_000)

  it.each([
    { exitCode: 0, marker: 'windows-fast-exit-zero' },
    { exitCode: 7, marker: 'windows-fast-exit-seven' }
  ])(
    'drains output before emitting one exact exit event for a fast command ending with $exitCode',
    async ({ exitCode, marker }) => {
      const sessionId = `windows-fast-exit-${exitCode}`
      const eventOrder: string[] = []
      const exitEvents: Array<number | null> = []
      const exited = createDeferred<number | null>()
      let output = ''
      let markerObserved = false

      await startTerminal({
        scope: blockRunScope(sessionId),
        workingDirectory,
        shell: 'powershell.exe',
        launchCommand: `[Console]::Write('${marker}'); exit ${exitCode}`,
        sessionKind: 'workflow',
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
          if (!markerObserved && output.includes(marker)) {
            markerObserved = true
            eventOrder.push('output')
          }
        },
        onExit: (event) => {
          exitEvents.push(event.exitCode)
          eventOrder.push('exit')
          exited.resolve(event.exitCode)
        }
      })

      await expect(exited.promise).resolves.toBe(exitCode)
      expect(output).toContain(marker)
      expect(eventOrder).toEqual(['output', 'exit'])
      expect(exitEvents).toEqual([exitCode])
    },
    20_000
  )

  it('starts the auto-selected ordinary PowerShell terminal and keeps it writable', async () => {
    const sessionId = 'windows-default-powershell-session'
    const expectedShellName = isPwshAvailable() ? 'pwsh.exe' : 'powershell.exe'
    let output = ''

    await startTerminal({
      scope: blockRunScope(sessionId),
      workingDirectory,
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })
    adapter.write(
      sessionId,
      "$name = [IO.Path]::GetFileName((Get-Process -Id $PID).Path).ToLowerInvariant(); [Console]::WriteLine(('CLEANCODE_DEFAULT_SHELL_{0}' -f $name))\r"
    )
    await waitUntil(() => output.includes(`CLEANCODE_DEFAULT_SHELL_${expectedShellName}`))

    adapter.write(
      sessionId,
      "[Console]::WriteLine(('CLEANCODE_DEFAULT_SHELL_{0}' -f 'WRITABLE'))\r"
    )
    await waitUntil(() => output.includes('CLEANCODE_DEFAULT_SHELL_WRITABLE'))

    expect(output).toContain(`CLEANCODE_DEFAULT_SHELL_${expectedShellName}`)
    expect(output).toContain('CLEANCODE_DEFAULT_SHELL_WRITABLE')
  }, 40_000)

  it('starts an Agent job requested immediately after creating the PowerShell pty', async () => {
    let output = ''
    const started = createDeferred<void>()
    const exited = createDeferred<number | null>()

    await startTerminal({
      scope: agentRunScope('immediate-windows-agent-session'),
      workingDirectory,
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

  it.each([
    { terminalSourceTheme: 'light' as const, expectedConsoleColors: 'Black|White' },
    { terminalSourceTheme: 'dark' as const, expectedConsoleColors: 'Gray|Black' }
  ])(
    'pins the $terminalSourceTheme Windows console fallback before the Agent process starts',
    async ({ terminalSourceTheme, expectedConsoleColors }) => {
      let output = ''
      let exitCode: number | null | undefined
      const exited = createDeferred<number | null>()

      await startTerminal({
        scope: agentRunScope(`windows-agent-${terminalSourceTheme}-console-colors`),
        workingDirectory,
        shell: 'powershell.exe',
        terminalSourceTheme,
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => undefined
      })
      adapter.launchForegroundJob({
        args: [
          '-NoLogo',
          '-NoProfile',
          '-Command',
          "[Console]::WriteLine(('CLEANCODE_CONSOLE_COLORS:{0}|{1}' -f [Console]::ForegroundColor, [Console]::BackgroundColor))"
        ],
        environment: {},
        executable: 'powershell.exe',
        generation: 1,
        launchId: `${terminalSourceTheme}-console-colors-launch`,
        onExit: (event) => {
          exitCode = event.exitCode
          exited.resolve(event.exitCode)
        },
        onStarted: () => undefined,
        sessionId: `windows-agent-${terminalSourceTheme}-console-colors`
      })

      await waitUntil(() => output.includes('CLEANCODE_CONSOLE_COLORS:') || exitCode !== undefined)
      expect(
        output,
        `Windows console color probe exited with ${String(exitCode)} and output ${JSON.stringify(output.slice(-1_000))}`
      ).toContain(`CLEANCODE_CONSOLE_COLORS:${expectedConsoleColors}`)
      await expect(exited.promise).resolves.toBe(0)
    },
    20_000
  )

  it('preserves terminal mouse modes through ConPTY output', async () => {
    const sessionId = 'windows-agent-mouse-modes'
    const scope = agentRunScope(sessionId)
    let output = ''

    try {
      await startTerminal({
        scope,
        workingDirectory,
        shell: 'powershell.exe',
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => undefined
      })
      const exited = createDeferred<number | null>()
      adapter.launchForegroundJob({
        args: ['-e', createWindowsMouseModeProbeScript()],
        environment: {},
        executable: process.execPath,
        generation: 1,
        launchId: 'mouse-mode-launch',
        onExit: (event) => exited.resolve(event.exitCode),
        onStarted: () => undefined,
        sessionId
      })

      await waitUntil(() => output.includes('CLEANCODE_MOUSE_MODE_READY'))
      await expect(exited.promise).resolves.toBe(0)
      await model.flush(scope)

      expect(output).toContain('\u001b[?1002h')
      expect(output).toContain('\u001b[?1006h')
      await expect(model.captureCheckpoint(scope)).resolves.toMatchObject({
        modes: { mouseTrackingMode: 'drag' }
      })
    } finally {
      await adapter.stop(sessionId)
    }
  }, 20_000)

  it('interrupts only the Agent job, reports exit, and keeps PowerShell writable', async () => {
    let output = ''
    let terminalExited = false
    const firstStarted = createDeferred<void>()
    const firstExit = createDeferred<number | null>()
    const secondExit = createDeferred<number | null>()

    await startTerminal({
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

  async function startTerminal(command: StartTerminalProcessCommand) {
    model.create({
      identity: command.scope,
      columns: command.columns,
      rows: command.rows,
      workingDirectory: command.workingDirectory,
      terminalSourceTheme: command.terminalSourceTheme,
      onQueryResponse: (response) => adapter.write(command.scope.sessionId, response),
      onFlowControlChange: () => undefined
    })

    return adapter.start({
      ...command,
      onOutput: (event) => {
        model.acceptOutput(command.scope, event.data)
        command.onOutput(event)
      }
    })
  }
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

function isPwshAvailable(): boolean {
  const programFilesRoots = [
    process.env.ProgramW6432,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)']
  ]
  if (
    programFilesRoots.some(
      (root) =>
        root &&
        pathWin32.isAbsolute(root) &&
        isRealExecutable(pathWin32.join(root, 'PowerShell', '7', 'pwsh.exe'))
    )
  ) {
    return true
  }

  const localAppData = process.env.LOCALAPPDATA
  if (
    localAppData &&
    pathWin32.isAbsolute(localAppData) &&
    isRealExecutable(pathWin32.join(localAppData, 'Microsoft', 'PowerShell', '7', 'pwsh.exe'))
  ) {
    return true
  }

  const pathValue = process.env.Path || process.env.PATH
  for (const rawDirectory of pathValue?.split(pathWin32.delimiter) ?? []) {
    const directory = rawDirectory.trim().replace(/^"|"$/gu, '')
    if (!pathWin32.isAbsolute(directory)) continue

    const candidate = pathWin32.join(directory, 'pwsh.exe')
    if (
      isRealExecutable(candidate) ||
      (isWindowsAppExecutionAlias(candidate) && existsSync(candidate))
    ) {
      return true
    }
  }

  return false
}

function isRealExecutable(candidate: string): boolean {
  try {
    if (!existsSync(candidate)) return false
    const stat = statSync(candidate)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

function isWindowsAppExecutionAlias(candidate: string): boolean {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]/iu.test(pathWin32.normalize(candidate))
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

function createWindowsMouseModeProbeScript(): string {
  return [
    'process.stdout.write(',
    '  "\\x1b[?1000h\\x1b[?1002h\\x1b[?1006hCLEANCODE_MOUSE_MODE_READY\\r\\n",',
    '  () => process.exit(0)',
    ')'
  ].join('')
}

async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Windows Agent PTY output.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
