import { createServer, type Server } from 'node:net'
import { spawn } from 'node:child_process'

import { NodeLocalPortReservationAdapter } from '../../../../src/contexts/run/infrastructure/network/NodeLocalPortReservationAdapter'
import { NodeTcpListenerInspectionAdapter } from '../../../../src/contexts/run/infrastructure/network/NodeTcpListenerInspectionAdapter'
import { NodePtyTerminalProcessAdapter } from '../../../../src/contexts/run/infrastructure/pty/NodePtyTerminalProcessAdapter'

describe('local port infrastructure', () => {
  it('holds a real loopback reservation until explicitly released', async () => {
    const adapter = new NodeLocalPortReservationAdapter()
    const first = await adapter.tryReserve({ host: '127.0.0.1' })

    expect(first?.port).toBeGreaterThan(0)
    await expect(adapter.tryReserve({ host: '127.0.0.1', port: first?.port })).resolves.toBeNull()

    await first?.release()
    const replacement = await adapter.tryReserve({ host: '127.0.0.1', port: first?.port })
    expect(replacement?.port).toBe(first?.port)
    await replacement?.release()
  })

  it('shares an in-flight release and retries after a close failure', async () => {
    const server = createServer()
    const closeServer = server.close.bind(server)
    let closeCalls = 0
    server.close = ((callback?: (error?: Error) => void) => {
      closeCalls += 1
      if (closeCalls === 1) {
        queueMicrotask(() => callback?.(new Error('simulated close failure')))
        return server
      }
      return closeServer(callback)
    }) as Server['close']
    const adapter = createReservationAdapter(() => server)
    const held = await adapter.tryReserve({ host: '127.0.0.1' })
    if (!held) throw new Error('Expected a local port reservation.')

    try {
      const firstRelease = held.release()
      const concurrentRelease = held.release()

      expect(firstRelease).toBe(concurrentRelease)
      await expect(Promise.allSettled([firstRelease, concurrentRelease])).resolves.toEqual([
        expect.objectContaining({ status: 'rejected' }),
        expect.objectContaining({ status: 'rejected' })
      ])
      expect(closeCalls).toBe(1)

      await expect(held.release()).resolves.toBeUndefined()
      expect(closeCalls).toBe(2)
      await expect(held.release()).resolves.toBeUndefined()
      expect(closeCalls).toBe(2)
    } finally {
      if (server.listening) {
        await new Promise<void>((resolve) => closeServer(() => resolve()))
      }
    }
  })

  it('fails closed when only some stable listeners belong to the managed root', async () => {
    const system = new FakeListenerInspectionSystem({
      listenerSnapshots: [
        [101, 102],
        [101, 102]
      ],
      descendantResults: new Map([
        [101, [true]],
        [102, [false]]
      ])
    })
    const inspector = createListenerInspector(system)

    await expect(
      inspector.inspect({ host: '127.0.0.1', port: 65_534, rootProcessId: process.pid })
    ).resolves.toEqual({ ownership: 'unknown', reason: 'listener-ownership-ambiguous' })
  })

  it('proves every stable listener twice before reporting managed ownership', async () => {
    const system = new FakeListenerInspectionSystem({
      listenerSnapshots: [
        [101, 102],
        [101, 102]
      ],
      descendantResults: new Map([
        [101, [true, true]],
        [102, [true, true]]
      ])
    })
    const inspector = createListenerInspector(system)

    await expect(
      inspector.inspect({ host: '127.0.0.1', port: 65_534, rootProcessId: process.pid })
    ).resolves.toEqual({ ownership: 'owned', listenerProcessId: 101 })
    expect(system.descendantCalls).toEqual([101, 102, 101, 102])
  })

  it('fails closed when a listener loses managed ancestry during stable-set inspection', async () => {
    const system = new FakeListenerInspectionSystem({
      listenerSnapshots: [
        [101, 102],
        [101, 102]
      ],
      descendantResults: new Map([
        [101, [true, true]],
        [102, [true, false]]
      ])
    })
    const inspector = createListenerInspector(system)

    await expect(
      inspector.inspect({ host: '127.0.0.1', port: 65_534, rootProcessId: process.pid })
    ).resolves.toEqual({
      ownership: 'unknown',
      reason: 'listener-ownership-changed-during-inspection'
    })
  })

  it('fails closed when the listener process set changes during inspection', async () => {
    const system = new FakeListenerInspectionSystem({
      listenerSnapshots: [
        [101, 102],
        [101, 103]
      ],
      descendantResults: new Map([
        [101, [true]],
        [102, [true]]
      ])
    })
    const inspector = createListenerInspector(system)

    await expect(
      inspector.inspect({ host: '127.0.0.1', port: 65_534, rootProcessId: process.pid })
    ).resolves.toEqual({
      ownership: 'unknown',
      reason: 'listener-changed-during-inspection'
    })
  })

  it.runIf(process.platform === 'darwin')(
    'distinguishes a listener in the managed PTY process group from an external listener',
    async () => {
      const reservations = new NodeLocalPortReservationAdapter()
      const held = await reservations.tryReserve({ host: '127.0.0.1' })
      expect(held).not.toBeNull()
      const port = held?.port ?? 0
      await held?.release()

      const processes = new NodePtyTerminalProcessAdapter()
      let output = ''
      const program = [
        'const net = require("node:net")',
        `net.createServer().listen(${port}, "127.0.0.1", () => console.log("OWNED_READY"))`
      ].join(';')
      const handle = await processes.start({
        scope: runScope('owned-listener'),
        workingDirectory: process.cwd(),
        shell: '/bin/sh',
        launchCommand: `${shellQuote(process.execPath)} -e ${shellQuote(program)}`,
        columns: 80,
        rows: 24,
        onOutput: (event) => {
          output += event.data
        },
        onExit: () => undefined
      })
      await waitUntil(() => output.includes('OWNED_READY'))

      const inspector = new NodeTcpListenerInspectionAdapter()
      await expect(
        inspector.inspect({ host: '127.0.0.1', port, rootProcessId: handle.processId })
      ).resolves.toMatchObject({ ownership: 'owned' })
      await processes.stop('owned-listener')

      const externalServer = createServer()
      await new Promise<void>((resolve) => externalServer.listen(port, '127.0.0.1', resolve))
      const unrelatedRoot = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore'
      })
      await new Promise<void>((resolve, reject) => {
        unrelatedRoot.once('spawn', resolve)
        unrelatedRoot.once('error', reject)
      })
      try {
        await expect(
          inspector.inspect({
            host: '127.0.0.1',
            port,
            rootProcessId: unrelatedRoot.pid ?? 0
          })
        ).resolves.toMatchObject({ ownership: 'external' })
      } finally {
        unrelatedRoot.kill('SIGKILL')
        await new Promise<void>((resolve) => unrelatedRoot.once('exit', () => resolve()))
        await new Promise<void>((resolve) => externalServer.close(() => resolve()))
      }
    },
    10_000
  )

  it.runIf(process.platform === 'darwin')(
    'does not treat an unrelated listener in the same process group as owned',
    async () => {
      const server = createServer()
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      const unrelatedRoot = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: 'ignore'
      })
      await new Promise<void>((resolve, reject) => {
        unrelatedRoot.once('spawn', resolve)
        unrelatedRoot.once('error', reject)
      })

      try {
        const inspector = new NodeTcpListenerInspectionAdapter()
        await expect(
          inspector.inspect({
            host: '127.0.0.1',
            port,
            rootProcessId: unrelatedRoot.pid ?? 0
          })
        ).resolves.toMatchObject({ ownership: 'external' })
      } finally {
        unrelatedRoot.kill('SIGKILL')
        await new Promise<void>((resolve) => unrelatedRoot.once('exit', () => resolve()))
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    },
    10_000
  )
})

function runScope(sessionId: string) {
  return {
    projectId: 'project-test',
    projectDirectory: process.cwd(),
    workspaceName: 'main',
    workspaceDirectory: process.cwd(),
    gitBranch: 'main',
    blockId: 'api',
    sessionId,
    runId: `run-${sessionId}`,
    generation: 1
  }
}

interface ListenerInspectionSystem {
  platform(): NodeJS.Platform
  isProcessAlive(processId: number): Promise<boolean>
  readListenerProcessIds(port: number): Promise<readonly number[] | null>
  isDescendantOf(listenerProcessId: number, rootProcessId: number): Promise<boolean>
}

class FakeListenerInspectionSystem implements ListenerInspectionSystem {
  readonly descendantCalls: number[] = []
  private readonly listenerSnapshots: Array<readonly number[] | null>
  private readonly descendantResults: Map<number, boolean[]>

  constructor(input: {
    readonly listenerSnapshots: Array<readonly number[] | null>
    readonly descendantResults: Map<number, boolean[]>
  }) {
    this.listenerSnapshots = [...input.listenerSnapshots]
    this.descendantResults = input.descendantResults
  }

  platform(): NodeJS.Platform {
    return 'darwin'
  }

  async isProcessAlive(): Promise<boolean> {
    return true
  }

  async readListenerProcessIds(): Promise<readonly number[] | null> {
    return this.listenerSnapshots.shift() ?? null
  }

  async isDescendantOf(listenerProcessId: number): Promise<boolean> {
    this.descendantCalls.push(listenerProcessId)
    return this.descendantResults.get(listenerProcessId)?.shift() ?? false
  }
}

function createListenerInspector(
  system: ListenerInspectionSystem
): NodeTcpListenerInspectionAdapter {
  return new NodeTcpListenerInspectionAdapter(system)
}

function createReservationAdapter(serverFactory: () => Server): NodeLocalPortReservationAdapter {
  return new NodeLocalPortReservationAdapter(serverFactory)
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

async function waitUntil(assertion: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!assertion()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for listener output.')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
