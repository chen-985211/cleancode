import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, win32 as pathWin32 } from 'node:path'

import { spawn as spawnPtyProcess } from 'node-pty'

import type { StartTerminalProcessCommand } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { HeadlessTerminalModelAdapter } from '../../../../src/contexts/run/infrastructure/terminal-model/HeadlessTerminalModelAdapter'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import {
  createWindowsPowerShellLaunchArguments,
  encodePowerShellCommand
} from '../../../../src/contexts/run/infrastructure/pty/PowerShellUtf8Bootstrap'
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

  it.each([
    { label: 'auto-selected PowerShell', shell: undefined },
    { label: 'inbox Windows PowerShell 5.1', shell: inboxWindowsPowerShellExecutable() }
  ])(
    'starts $label with UTF-8 encodings and native child output',
    async ({ label, shell }) => {
      const sessionId = `windows-utf8-${label === 'auto-selected PowerShell' ? 'auto' : 'inbox'}`
      const expectedShell = shell ?? (await resolveTerminalShellExecutable())
      const expectedShellName = pathWin32.basename(expectedShell).toLowerCase()
      const expectedUtf8Output = 'CLEANCODE_UTF8_CHILD_OUTPUT:中文✅🚀:END'
      let output = ''

      try {
        await startTerminal({
          scope: blockRunScope(sessionId),
          workingDirectory,
          ...(shell ? { shell } : {}),
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
        await waitUntil(
          () => output.includes(`CLEANCODE_DEFAULT_SHELL_${expectedShellName}`),
          30_000
        )

        adapter.write(
          sessionId,
          "[Console]::WriteLine(('CLEANCODE_UTF8_ENCODINGS:{0}|{1}|{2}' -f [Console]::InputEncoding.WebName, [Console]::OutputEncoding.WebName, $OutputEncoding.WebName))\r"
        )
        await waitUntil(() => output.includes('CLEANCODE_UTF8_ENCODINGS:utf-8|utf-8|utf-8'), 30_000)

        adapter.write(sessionId, createPowerShellUtf8NodeOutputCommand(`${expectedUtf8Output}\r\n`))
        await waitUntil(() => output.includes(expectedUtf8Output), 30_000)

        adapter.write(
          sessionId,
          "[Console]::WriteLine(('CLEANCODE_DEFAULT_SHELL_{0}' -f 'WRITABLE'))\r"
        )
        await waitUntil(() => output.includes('CLEANCODE_DEFAULT_SHELL_WRITABLE'), 30_000)

        expect(output).toContain(`CLEANCODE_DEFAULT_SHELL_${expectedShellName}`)
        expect(output).toContain('CLEANCODE_UTF8_ENCODINGS:utf-8|utf-8|utf-8')
        expect(output).toContain(expectedUtf8Output)
        expect(output).toContain('CLEANCODE_DEFAULT_SHELL_WRITABLE')
      } finally {
        await adapter.stop(sessionId)
      }
    },
    40_000
  )

  it.each([
    { label: 'auto-selected PowerShell', shell: undefined },
    { label: 'inbox Windows PowerShell 5.1', shell: inboxWindowsPowerShellExecutable() }
  ])(
    'preserves prologue parsing and interactive scope in $label',
    async ({ label, shell }) => {
      const sessionId = `windows-prologue-${label === 'auto-selected PowerShell' ? 'auto' : 'inbox'}`
      const marker = 'CLEANCODE_PROLOGUE_READY'
      const launchCommand = [
        'using namespace System.Text',
        `param([string] $Value = '${marker}')`,
        '$cleancodeScopedValue = $Value',
        'function Get-CleancodeScopedValue { $cleancodeScopedValue }',
        "Write-Output ('{0}|{1}' -f $Value, [UTF8Encoding].FullName)"
      ].join('\n')
      let output = ''

      try {
        await startTerminal({
          scope: blockRunScope(sessionId),
          workingDirectory,
          ...(shell ? { shell } : {}),
          launchCommand,
          launchMode: 'interactive',
          columns: 80,
          rows: 24,
          onOutput: (event) => {
            output += event.data
          },
          onExit: () => undefined
        })
        await waitUntil(() => output.includes(`${marker}|System.Text.UTF8Encoding`), 30_000)

        adapter.write(
          sessionId,
          "Write-Output ('CLEANCODE_SCOPE:{0}' -f (Get-CleancodeScopedValue))\r"
        )
        await waitUntil(() => output.includes(`CLEANCODE_SCOPE:${marker}`), 30_000)

        expect(output).toContain(`${marker}|System.Text.UTF8Encoding`)
        expect(output).toContain(`CLEANCODE_SCOPE:${marker}`)
      } finally {
        await adapter.stop(sessionId)
      }
    },
    40_000
  )

  it('executes the generated startup command after entering ConstrainedLanguage', async () => {
    const marker = 'CLEANCODE_CONSTRAINED_LANGUAGE_READY'
    const launchArguments = createWindowsPowerShellLaunchArguments(
      `param([string] $Value = '${marker}'); Write-Output $Value`,
      false
    )
    const startupScript = decodeEncodedPowerShellArgument(launchArguments)
    const bootstrapOnlyScript = decodeEncodedPowerShellArgument(
      createWindowsPowerShellLaunchArguments(undefined, false)
    )
    const constrainedScript = [
      '$ExecutionContext.SessionState.LanguageMode = "ConstrainedLanguage"',
      `Microsoft.PowerShell.Utility\\Invoke-Expression -Command ${quotePowerShellString(bootstrapOnlyScript)}`,
      "Write-Output ('CLEANCODE_CONSTRAINED_BOOTSTRAP_STATUS:{0}' -f $?)",
      `Microsoft.PowerShell.Utility\\Invoke-Expression -Command ${quotePowerShellString(startupScript)}`
    ].join('\n')
    const exited = createDeferred<number>()
    let hasExited = false
    let output = ''
    const ptyProcess = spawnPtyProcess(
      inboxWindowsPowerShellExecutable(),
      ['-NoLogo', '-EncodedCommand', encodePowerShellCommand(constrainedScript)],
      {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: workingDirectory,
        env: createTerminalProcessEnvironment({
          explicit: undefined,
          inherited: process.env,
          platform: 'win32'
        }),
        useConpty: true,
        useConptyDll: true
      }
    )
    ptyProcess.onData((data) => {
      output += data
    })
    ptyProcess.onExit((event) => {
      hasExited = true
      exited.resolve(event.exitCode)
    })

    try {
      await waitUntil(() => output.includes(marker), 15_000)
      await waitUntil(() => hasExited, 5_000)
      await expect(exited.promise).resolves.toBe(0)
      expect(output).toContain(marker)
      expect(output).toContain('CLEANCODE_CONSTRAINED_BOOTSTRAP_STATUS:True')
      expect(output).not.toMatch(/Cannot create type|Write-Error/u)
    } finally {
      if (!hasExited) {
        ptyProcess.kill()
        await waitUntil(() => hasExited, 5_000)
      }
    }
  }, 30_000)

  it('preserves UTF-8 output and lifecycle for an immediate Agent foreground job', async () => {
    const sessionId = 'immediate-windows-agent-session'
    const expectedUtf8Output = 'CLEANCODE_AGENT_UTF8_OUTPUT:你好世界🌍🤖:END'
    let output = ''
    let startedCount = 0
    let terminalExited = false
    const started = createDeferred<void>()
    const exited = createDeferred<number | null>()

    try {
      await startTerminal({
        scope: agentRunScope(sessionId),
        workingDirectory,
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
        args: ['-e', createUtf8NodeOutputScript(`${expectedUtf8Output}\r\n`)],
        environment: {},
        executable: process.execPath,
        generation: 1,
        launchId: 'immediate-utf8-launch',
        onExit: (event) => exited.resolve(event.exitCode),
        onStarted: () => {
          startedCount += 1
          started.resolve()
        },
        sessionId
      })

      await started.promise
      await waitUntil(() => output.includes(expectedUtf8Output), 30_000)
      await expect(exited.promise).resolves.toBe(0)

      adapter.write(
        sessionId,
        "[Console]::WriteLine(('CLEANCODE_AGENT_OUTER_{0}' -f 'WRITABLE'))\r"
      )
      await waitUntil(() => output.includes('CLEANCODE_AGENT_OUTER_WRITABLE'), 30_000)

      expect(startedCount).toBe(1)
      expect(output).toContain(expectedUtf8Output)
      expect(output).toContain('CLEANCODE_AGENT_OUTER_WRITABLE')
      expect(terminalExited).toBe(false)
    } finally {
      await adapter.stop(sessionId)
    }
  }, 40_000)

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

function decodeEncodedPowerShellArgument(arguments_: readonly string[]): string {
  const encodedCommandIndex = arguments_.indexOf('-EncodedCommand')
  if (encodedCommandIndex < 0) throw new Error('Expected an encoded PowerShell command')
  return Buffer.from(arguments_[encodedCommandIndex + 1] ?? '', 'base64').toString('utf16le')
}

function quotePowerShellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function createWindowsMouseModeProbeScript(): string {
  return [
    'process.stdout.write(',
    '  "\\x1b[?1000h\\x1b[?1002h\\x1b[?1006hCLEANCODE_MOUSE_MODE_READY\\r\\n",',
    '  () => process.exit(0)',
    ')'
  ].join('')
}

function createPowerShellUtf8NodeOutputCommand(output: string): string {
  const encodedExecutable = Buffer.from(process.execPath, 'utf8').toString('base64')
  const encodedOutput = Buffer.from(output, 'utf8').toString('base64')

  return (
    [
      '$cleancodeUtf8 = [System.Text.Encoding]::UTF8',
      `$cleancodeNode = $cleancodeUtf8.GetString([System.Convert]::FromBase64String('${encodedExecutable}'))`,
      `& $cleancodeNode -e "process.stdout.write(Buffer.from('${encodedOutput}','base64'))"`
    ].join('; ') + '\r'
  )
}

function createUtf8NodeOutputScript(output: string): string {
  const encodedOutput = Buffer.from(output, 'utf8').toString('base64')
  return `process.stdout.write(Buffer.from('${encodedOutput}','base64'))`
}

async function waitUntil(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for Windows Agent PTY output.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
