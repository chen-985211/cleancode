import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, type Server } from 'node:net'

import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'
import { NodeTcpReadinessAdapter } from '../../../../src/contexts/run/infrastructure/readiness/NodeTcpReadinessAdapter'

describe('pty terminal process adapter', () => {
  let workingDirectory: string
  let adapter: NodePtyTerminalProcessAdapter

  beforeEach(async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), 'cleancode-pty-'))
    adapter = new NodePtyTerminalProcessAdapter()
  })

  afterEach(async () => {
    adapter.disposeAll()
    await rm(workingDirectory, { recursive: true, force: true })
  })

  it('starts a local shell, accepts input, emits output, and stops', async () => {
    let output = ''

    const processHandle = await adapter.start({
      sessionId: 'session-1',
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
    adapter.stop('session-1')

    expect(processHandle.processId).toBeGreaterThan(0)
    expect(output).toContain('printf "cleancode-pty-ok\\n"')
    expect(output).toContain('cleancode-pty-ok')
  }, 10_000)

  it('preserves a complete input write in the default macOS shell', async () => {
    let output = ''

    await adapter.start({
      sessionId: 'zsh-session',
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

  it('runs a command directly and reports its real exit code', async () => {
    let output = ''
    let resolveExit: (exitCode: number | null) => void = () => undefined
    const exited = new Promise<number | null>((resolve) => {
      resolveExit = resolve
    })

    await adapter.start({
      sessionId: 'task-session',
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
      port: reservedPort,
      signal: new AbortController().signal
    })

    server = createServer()
    await new Promise<void>((resolve) => server?.listen(reservedPort, '127.0.0.1', resolve))

    await expect(waiting).resolves.toBeUndefined()
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

async function waitUntil(assertion: () => boolean): Promise<void> {
  const startedAt = Date.now()

  while (!assertion()) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error('Timed out waiting for terminal output.')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
