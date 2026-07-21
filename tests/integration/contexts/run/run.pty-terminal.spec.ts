import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:net'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { NodeTcpReadinessAdapter } from '../../../../src/contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'
import { createDeferred } from '../../../fixtures/deferred'

describe('pty terminal process adapter', () => {
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

    adapter.write('session-1', 'printf "cleancode-pty-ok\\n"\r')

    await waitUntil(() => output.includes('cleancode-pty-ok'))
    await adapter.stop('session-1')

    expect(processHandle.processId).toBeGreaterThan(0)
    expect(output).toContain('printf "cleancode-pty-ok\\n"')
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

  it('preserves a complete input write in the default macOS shell', async () => {
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
  }, 10_000)

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

  it.runIf(process.platform !== 'win32')(
    'waits for an ignoring child process group to exit and releases its listening port',
    async () => {
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
    },
    10_000
  )
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
    workspaceName: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: 'block-test',
    sessionId,
    runId: `run-${sessionId}`,
    generation: 1
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
