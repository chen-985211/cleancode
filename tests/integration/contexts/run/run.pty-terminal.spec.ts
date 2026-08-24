import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:net'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { NodeTcpReadinessAdapter } from '../../../../src/contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'
import { createDeferred } from '../../../fixtures/deferred'

describe.runIf(process.platform !== 'win32')('POSIX pty terminal process adapter', () => {
  let workingDirectory: string
  let adapter: NodePtyTerminalProcessAdapter

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-pty-'))
    adapter = new NodePtyTerminalProcessAdapter()
  })

  afterEach(async () => {
    await adapter.disposeAll()
    await rm(workingDirectory, { recursive: true, force: true })
  })

  it('starts a local shell, accepts input, emits output, and stops', async () => {
    let output = ''

    const processHandle = await adapter.start({
      scope: runScope('session-1'),
      workingDirectory,
      shell: '/bin/sh',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })

    adapter.write('session-1', 'printf "cleancode-%s\\n" "pty-ok"\r')

    await waitUntil(() => output.includes('cleancode-pty-ok'))
    await adapter.stop('session-1')

    expect(processHandle.processId).toBeGreaterThan(0)
    expect(output).toContain('cleancode-pty-ok')
  }, 10_000)

  it('waits for every terminal cleanup before reporting a dispose failure', async () => {
    let failingOutput = ''
    let delayedOutput = ''
    await adapter.start({
      scope: runScope('dispose-failing-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "dispose-failing-ready\\n"; while :; do sleep 1; done',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        failingOutput += event.data
      },
      onExit: () => undefined
    })
    await adapter.start({
      scope: runScope('dispose-delayed-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "dispose-delayed-ready\\n"; while :; do sleep 1; done',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        delayedOutput += event.data
      },
      onExit: () => undefined
    })
    await waitUntil(
      () =>
        failingOutput.includes('dispose-failing-ready') &&
        delayedOutput.includes('dispose-delayed-ready')
    )

    const originalStop = adapter.stop.bind(adapter)
    const failedStopCompleted = createDeferred<void>()
    const releaseDelayedStop = createDeferred<void>()
    const delayedStopCompleted = createDeferred<void>()
    const cleanupFailure = new Error('simulated terminal cleanup failure')
    const stopSpy = vi.spyOn(adapter, 'stop').mockImplementation(async (sessionId) => {
      if (sessionId === 'dispose-delayed-session') {
        try {
          await releaseDelayedStop.promise
          await originalStop(sessionId)
        } finally {
          delayedStopCompleted.resolve()
        }
        return
      }

      await originalStop(sessionId)
      failedStopCompleted.resolve()
      throw cleanupFailure
    })
    let disposalSettled = false

    try {
      const disposal = adapter.disposeAll()
      void disposal.then(
        () => {
          disposalSettled = true
        },
        () => {
          disposalSettled = true
        }
      )

      await failedStopCompleted.promise
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(stopSpy).toHaveBeenCalledTimes(2)
      expect(disposalSettled).toBe(false)

      releaseDelayedStop.resolve()
      await expect(disposal).rejects.toBe(cleanupFailure)
    } finally {
      releaseDelayedStop.resolve()
      await delayedStopCompleted.promise
      stopSpy.mockRestore()
    }
  }, 10_000)

  it.runIf(process.platform === 'darwin')(
    'preserves a complete input write in the default macOS shell',
    async () => {
      let output = ''

      await adapter.start({
        scope: runScope('zsh-session'),
        workingDirectory,
        shell: '/bin/zsh',
        columns: 88,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => undefined
      })

      adapter.write('zsh-session', 'pwd\r')

      await waitUntil(() => output.includes(workingDirectory))

      expect(output).toContain(workingDirectory)
    },
    10_000
  )

  it('keeps an interactive launch session writable after Ctrl+C', async () => {
    let output = ''
    let didExit = false

    await adapter.start({
      scope: runScope('interactive-launch-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "interactive-launch-ready\\n"; while :; do sleep 1; done',
      launchMode: 'interactive',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => {
        didExit = true
      }
    })

    await waitUntil(() => output.includes('interactive-launch-ready'))
    adapter.write('interactive-launch-session', '\x03')
    adapter.write('interactive-launch-session', 'printf "after-interrupt\\n"\r')

    await waitUntil(() => output.split('after-interrupt').length >= 3)

    adapter.write(
      'interactive-launch-session',
      'sh -c "printf \\"second-command-ready\\\\n\\"; while :; do sleep 1; done"\r'
    )
    await waitUntil(() => output.split('second-command-ready').length >= 3)
    adapter.write('interactive-launch-session', '\x03')
    adapter.write('interactive-launch-session', 'printf "after-second-interrupt\\n"\r')

    await waitUntil(() => output.split('after-second-interrupt').length >= 3)

    expect(didExit).toBe(false)
    expect(output).toContain('after-second-interrupt')
  }, 10_000)

  it('keeps an interactive launch session writable after the launch command exits', async () => {
    let output = ''
    let didExit = false

    await adapter.start({
      scope: runScope('completed-interactive-launch-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "interactive-launch-complete\\n"; exit 7',
      launchMode: 'interactive',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => {
        didExit = true
      }
    })

    await waitUntil(() => output.includes('interactive-launch-complete'))
    adapter.write('completed-interactive-launch-session', 'printf "after-completion\\n"\r')

    await waitUntil(() => output.split('after-completion').length >= 3)

    expect(didExit).toBe(false)
    expect(output).toContain('after-completion')
  }, 10_000)

  it('reports foreground job exit without exiting the Agent terminal and accepts a second launch', async () => {
    let output = ''
    let terminalExited = false
    const firstExit = createDeferred<number | null>()
    const secondExit = createDeferred<number | null>()

    await adapter.start({
      scope: agentRunScope('agent-foreground-session'),
      workingDirectory,
      shell: '/bin/sh',
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
      args: ['-c', 'printf "foreground-ready\\n"; while :; do sleep 1; done'],
      environment: { CLEANCODE_TEST_SECRET: 'must-not-appear' },
      executable: '/bin/sh',
      generation: 1,
      launchId: 'launch-1',
      onExit: (event) => firstExit.resolve(event.exitCode),
      onStarted: () => undefined,
      sessionId: 'agent-foreground-session'
    })
    await waitUntil(() => output.includes('foreground-ready'))
    adapter.write('agent-foreground-session', '\x03')
    await firstExit.promise

    adapter.launchForegroundJob({
      args: ['-c', 'printf "second-launch\\n"; exit 7'],
      environment: {},
      executable: '/bin/sh',
      generation: 2,
      launchId: 'launch-2',
      onExit: (event) => secondExit.resolve(event.exitCode),
      onStarted: () => undefined,
      sessionId: 'agent-foreground-session'
    })

    await expect(secondExit.promise).resolves.toBe(7)
    adapter.write('agent-foreground-session', 'printf "shell-still-running\\n"\r')
    await waitUntil(() => output.includes('shell-still-running'))

    expect(terminalExited).toBe(false)
    expect(output).not.toContain('must-not-appear')
    expect(output).not.toContain('\x1eCLEANCODE_JOB:')
    expect(output).not.toContain('CLEANCODE_JOB:')
    expect(output).not.toContain('cleancode-agent-job-')
    expect(output).not.toContain('cleancode_job_status')
  }, 10_000)

  it('runs a command directly and reports its real exit code', async () => {
    let output = ''
    let resolveExit: (exitCode: number | null) => void = () => undefined
    const exited = new Promise<number | null>((resolve) => {
      resolveExit = resolve
    })

    await adapter.start({
      scope: runScope('task-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "dependency-install-failed\\n"; exit 7',
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: (event) => resolveExit(event.exitCode)
    })

    await expect(
      Promise.race([
        exited,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Command PTY did not exit.')), 1_000)
        )
      ])
    ).resolves.toBe(7)
    expect(output).toContain('dependency-install-failed')
  })

  it('overlays explicit environment values without losing the inherited environment', async () => {
    let output = ''
    let resolveExit: () => void = () => undefined
    const exited = new Promise<void>((resolve) => {
      resolveExit = resolve
    })

    await adapter.start({
      scope: runScope('environment-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: 'printf "%s:%s\\n" "$CLEANCODE_TEST_PORT" "$PATH"',
      environment: { CLEANCODE_TEST_PORT: '54321' },
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => resolveExit()
    })

    await exited
    expect(output).toContain('54321:')
    expect(output).not.toContain('54321:\r\n')
  })

  it.each([
    {
      environment: undefined,
      expected: 'electron-mode:unset',
      name: 'removes an inherited Electron Node-mode marker'
    },
    {
      environment: { ELECTRON_RUN_AS_NODE: '1' },
      expected: 'electron-mode:1',
      name: 'preserves an explicit Electron Node-mode request'
    }
  ])('$name', async ({ environment, expected }) => {
    const previousRunAsNode = process.env.ELECTRON_RUN_AS_NODE
    process.env.ELECTRON_RUN_AS_NODE = '1'
    let output = ''
    const exited = createDeferred<void>()

    try {
      await adapter.start({
        scope: runScope(`electron-environment-${expected}`),
        workingDirectory,
        shell: '/bin/sh',
        launchCommand:
          'if [ -z "${ELECTRON_RUN_AS_NODE+x}" ]; then printf "electron-mode:unset\\n"; else printf "electron-mode:%s\\n" "$ELECTRON_RUN_AS_NODE"; fi',
        environment,
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => exited.resolve()
      })

      await exited.promise

      expect(output).toContain(expected)
    } finally {
      if (previousRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE
      else process.env.ELECTRON_RUN_AS_NODE = previousRunAsNode
    }
  })

  it('publishes the source-theme capability profile and preserves inherited NO_COLOR', async () => {
    const previousNoColor = process.env.NO_COLOR
    process.env.NO_COLOR = 'respect-no-color'
    let output = ''
    const exited = createDeferred<void>()

    try {
      await adapter.start({
        scope: runScope('capability-environment-session'),
        workingDirectory,
        shell: '/bin/sh',
        launchCommand:
          'printf "%s|%s|%s|%s|%s\\n" "$TERM" "$COLORTERM" "$TERM_PROGRAM" "$COLORFGBG" "$NO_COLOR"',
        terminalSourceTheme: 'light',
        environment: {
          term: 'provider-terminal',
          ColorTerm: 'provider-color',
          term_program: 'provider-program',
          colorfgbg: 'provider-palette'
        },
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => exited.resolve()
      })

      await exited.promise

      expect(output).toContain('xterm-256color|truecolor|cleancode|0;15|respect-no-color')
    } finally {
      if (previousNoColor === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = previousNoColor
    }
  })

  it('reasserts Run-owned capabilities for a foreground job after shell environment mutation', async () => {
    let output = ''
    const exited = createDeferred<number | null>()

    await adapter.start({
      scope: agentRunScope('foreground-capability-session'),
      workingDirectory,
      shell: '/bin/sh',
      terminalSourceTheme: 'dark',
      environment: { NO_COLOR: 'respect-no-color' },
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })
    adapter.write(
      'foreground-capability-session',
      'export TERM=mutated COLORTERM=mutated TERM_PROGRAM=mutated COLORFGBG=mutated; printf "shell-mutated\\n"\r'
    )
    await waitUntil(() => output.includes('shell-mutated'))

    adapter.launchForegroundJob({
      args: [
        '-c',
        'printf "%s|%s|%s|%s|%s\\n" "$TERM" "$COLORTERM" "$TERM_PROGRAM" "$COLORFGBG" "$NO_COLOR"'
      ],
      environment: {
        Term: 'provider-terminal',
        colorterm: 'provider-color',
        term_program: 'provider-program',
        ColorFgBg: 'provider-palette'
      },
      executable: '/bin/sh',
      generation: 1,
      launchId: 'capability-launch',
      onExit: (event) => exited.resolve(event.exitCode),
      onStarted: () => undefined,
      sessionId: 'foreground-capability-session'
    })

    await expect(exited.promise).resolves.toBe(0)
    expect(output).toContain('xterm-256color|truecolor|cleancode|15;0|respect-no-color')
  })

  it.each([
    { disableJobControl: false, pauseOutput: false, scenario: 'after its started marker' },
    { disableJobControl: true, pauseOutput: false, scenario: 'with shell job control disabled' },
    {
      disableJobControl: false,
      pauseOutput: true,
      scenario: 'before its started marker is consumed'
    }
  ])(
    'lets an Agent foreground job finish SIGTERM cleanup $scenario',
    async (testCase) => {
      const cleanupPath = join(workingDirectory, 'foreground-cleanup.txt')
      const readyPath = join(workingDirectory, 'foreground-ready.txt')
      const started = createDeferred<void>()
      let output = ''
      const nodeProgram = [
        'const { writeFileSync } = require("node:fs")',
        `const cleanupPath = ${JSON.stringify(cleanupPath)}`,
        `const readyPath = ${JSON.stringify(readyPath)}`,
        'let terminating = false',
        'process.on("SIGHUP", () => {})',
        'process.on("SIGTERM", () => { if (terminating) return; terminating = true; setTimeout(() => { writeFileSync(cleanupPath, "cleanup-finished"); process.exit(0) }, 750) })',
        'writeFileSync(readyPath, String(process.pid))',
        'setInterval(() => {}, 1000)'
      ].join(';')
      let foregroundProcessId: number | null = null

      try {
        await adapter.start({
          scope: agentRunScope('foreground-cleanup-session'),
          workingDirectory,
          shell: '/bin/sh',
          columns: 80,
          rows: 24,
          onOutput: (event) => {
            output += event.data
          },
          onExit: () => undefined
        })
        if (testCase.disableJobControl) {
          adapter.write('foreground-cleanup-session', 'set +m; printf "JOB_CONTROL_DISABLED\\n"\r')
          await waitUntil(() => output.includes('JOB_CONTROL_DISABLED'))
        }
        if (testCase.pauseOutput) adapter.pauseOutput('foreground-cleanup-session')
        adapter.launchForegroundJob({
          args: ['-e', nodeProgram],
          environment: {},
          executable: process.execPath,
          generation: 1,
          launchId: 'foreground-cleanup-launch',
          onExit: () => undefined,
          onStarted: () => started.resolve(),
          sessionId: 'foreground-cleanup-session'
        })
        if (!testCase.pauseOutput) await started.promise
        foregroundProcessId = Number.parseInt(await waitForFile(readyPath), 10)

        await adapter.stop('foreground-cleanup-session')

        await expect(readFile(cleanupPath, 'utf8')).resolves.toBe('cleanup-finished')
      } finally {
        if (foregroundProcessId) {
          try {
            process.kill(foregroundProcessId, 'SIGKILL')
          } catch {
            // The expected cleanup path has already reaped the foreground process.
          }
        }
      }
    },
    10_000
  )

  it('waits for an ignoring child process group to exit and releases its listening port', async () => {
    const port = await reservePort()
    let output = ''
    const nodeProgram = [
      'const net = require("node:net")',
      'process.on("SIGHUP", () => {})',
      'process.on("SIGTERM", () => {})',
      `net.createServer().listen(${port}, "127.0.0.1", () => console.log("PORT_READY"))`
    ].join(';')

    await adapter.start({
      scope: runScope('stubborn-tree-session'),
      workingDirectory,
      shell: '/bin/sh',
      launchCommand: `${shellQuote(process.execPath)} -e ${shellQuote(nodeProgram)}`,
      columns: 80,
      rows: 24,
      onOutput: (event) => {
        output += event.data
      },
      onExit: () => undefined
    })
    await waitUntil(() => output.includes('PORT_READY'))

    await adapter.stop('stubborn-tree-session')

    const replacement = createServer()
    await expect(
      new Promise<void>((resolve, reject) => {
        replacement.once('error', reject)
        replacement.listen(port, '127.0.0.1', resolve)
      })
    ).resolves.toBeUndefined()
    await new Promise<void>((resolve) => replacement.close(() => resolve()))
  }, 10_000)
})

describe('TCP service readiness adapter', () => {
  let server: Server | null = null

  afterEach(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve())
  })

  it('resolves when a loopback service begins accepting connections', async () => {
    const reservedPort = await reservePort()
    const readiness = new NodeTcpReadinessAdapter({ retryIntervalMs: 10 })
    const waiting = readiness.waitUntilReady({
      host: '127.0.0.1',
      port: reservedPort,
      signal: new AbortController().signal
    })

    server = createServer()
    await new Promise<void>((resolve) => server?.listen(reservedPort, '127.0.0.1', resolve))

    await expect(waiting).resolves.toBeUndefined()
  })

  it('preserves the abort reason reported by the managed readiness timeout', async () => {
    const readiness = new NodeTcpReadinessAdapter({ retryIntervalMs: 10 })
    const controller = new AbortController()
    const timeoutReason = new Error('managed readiness timed out')

    controller.abort(timeoutReason)

    await expect(
      readiness.waitUntilReady({
        host: '127.0.0.1',
        port: 65_534,
        signal: controller.signal
      })
    ).rejects.toBe(timeoutReason)
  })
})

async function reservePort(): Promise<number> {
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const address = reservation.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise<void>((resolve) => reservation.close(() => resolve()))
  return port
}

function runScope(sessionId: string) {
  return {
    projectId: 'project-test',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: 'block-test',
    sessionId,
    runId: `run-${sessionId}`,
    generation: 1
  }
}

function agentRunScope(sessionId: string) {
  return {
    ...runScope(sessionId),
    blockId: 'agent-1',
    owner: { id: 'agent-1', kind: 'agent' as const }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()

  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for terminal output.')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function waitForFile(path: string): Promise<string> {
  const startedAt = Date.now()

  while (true) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      if (Date.now() - startedAt > 5_000) {
        throw new Error(`Timed out waiting for file: ${path}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}
