// @vitest-environment node

import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ElectronApplication } from 'playwright'

const { connectSocket, launchElectron } = vi.hoisted(() => ({
  connectSocket: vi.fn(),
  launchElectron: vi.fn()
}))

vi.mock('playwright', () => ({
  _electron: {
    launch: launchElectron
  }
}))
vi.mock('node:net', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  connect: connectSocket
}))

import {
  closeElectronApp,
  launchApp,
  readAuthenticatedTerminalProviderMetadata,
  teardownE2eScenario,
  waitForTextFile,
  waitForProcessIdExit,
  type E2eWorkbench
} from '../../support/e2eWorkbench'
import { runE2eTeardown, withE2eDeadline } from '../../support/e2eLifecycle'

const workbench: E2eWorkbench = {
  appStateDirectory: '/tmp/cleancode-e2e-state',
  projectDirectory: '/tmp/cleancode-e2e-project',
  registryDirectory: '/tmp/cleancode-e2e-registry'
}

interface MutableElectronProcess extends EventEmitter {
  exitCode: number | null
  kill: ReturnType<typeof vi.fn>
  pid: number
  signalCode: NodeJS.Signals | null
}

interface MutableSocket extends EventEmitter {
  destroy: ReturnType<typeof vi.fn>
  destroyed: boolean
  write: ReturnType<typeof vi.fn>
}

describe('E2E workbench lifecycle', () => {
  beforeEach(() => {
    connectSocket.mockReset()
    launchElectron.mockReset()
    vi.stubEnv('CLEANCODE_E2E_VISIBLE', '0')
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    await rm(join(process.cwd(), 'test-results', 'e2e', '123-electron-launch-failure.json'), {
      force: true
    })
  })

  it('starts tracing before background verification and preserves launch failure evidence', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(123)
    const launchError = new Error('background verification failed')
    const order: string[] = []
    const electronProcess = createElectronProcess()
    const tracing = {
      start: vi.fn(async () => {
        order.push('start tracing')
      }),
      stop: vi.fn(async () => {
        order.push('capture trace')
      })
    }
    const electronApp = {
      close: vi.fn(async () => {
        order.push('close application')
        electronProcess.exitCode = 0
        electronProcess.emit('exit', 0, null)
      }),
      context: () => ({ tracing }),
      firstWindow: vi.fn(async () => {
        order.push('verify background window')
        throw launchError
      }),
      on: vi.fn(),
      process: () => electronProcess,
      windows: () => []
    } as unknown as ElectronApplication

    launchElectron.mockResolvedValue(electronApp)

    await expect(launchApp(workbench)).rejects.toBe(launchError)
    expect(order).toEqual([
      'start tracing',
      'verify background window',
      'capture trace',
      'close application'
    ])
    expect(tracing.stop).toHaveBeenCalledWith({
      path: join(process.cwd(), 'test-results', 'e2e', '123-electron-launch-failure.zip')
    })
  })

  it('does not fail when no Electron application was assigned', async () => {
    await expect(closeElectronApp(undefined)).resolves.toBeUndefined()
    await expect(
      teardownE2eScenario({
        resources: {},
        taskFailed: true,
        taskName: 'failed before setup'
      })
    ).resolves.toBeUndefined()
  })

  it('accepts a normal process exit when Playwright close never settles', async () => {
    vi.useFakeTimers()
    try {
      const electronProcess = createElectronProcess()
      const electronApp = {
        close: vi.fn(() => new Promise<never>(() => undefined)),
        process: () => electronProcess
      } as unknown as ElectronApplication
      const closing = expect(closeElectronApp(electronApp)).resolves.toBeUndefined()

      await vi.advanceTimersByTimeAsync(0)
      electronProcess.exitCode = 0
      electronProcess.emit('exit', 0, null)
      await vi.advanceTimersByTimeAsync(10_000)

      await closing
      expect(electronProcess.kill).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not force-kill a process while asserting a natural exit', async () => {
    vi.useFakeTimers()
    try {
      const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
      const naturalExit = expect(waitForProcessIdExit(456)).rejects.toThrow(
        'Process 456 did not exit naturally'
      )

      await vi.advanceTimersByTimeAsync(3_001)
      await naturalExit

      expect(kill).not.toHaveBeenCalledWith(456, 'SIGKILL')
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the application and cleans the scenario when diagnostics fail', async () => {
    const diagnosticsError = new Error('diagnostics failed')
    const order: string[] = []

    await expect(
      runE2eTeardown({
        captureFailureDiagnostics: async () => {
          order.push('capture diagnostics')
          throw diagnosticsError
        },
        cleanupScenario: async () => {
          order.push('cleanup scenario')
        },
        closeApplication: async () => {
          order.push('close application')
        }
      })
    ).rejects.toBe(diagnosticsError)
    expect(order).toEqual(['capture diagnostics', 'close application', 'cleanup scenario'])
  })

  it('bounds teardown operations that never settle', async () => {
    vi.useFakeTimers()
    try {
      const deadline = expect(
        withE2eDeadline(new Promise<never>(() => undefined), 25, 'stuck teardown operation')
      ).rejects.toThrow('stuck teardown operation timed out after 25ms')

      await vi.advanceTimersByTimeAsync(25)
      await deadline
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for text file content to become complete and stable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-text-file-'))
    const filePath = join(directory, 'report.txt')

    try {
      await writeFile(filePath, 'partial', 'utf8')
      const rewrite = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          void writeFile(filePath, 'complete', 'utf8').then(resolve, reject)
        }, 5)
      })

      await expect(
        waitForTextFile(filePath, {
          intervalMs: 10,
          isComplete: (contents) => contents === 'complete',
          timeoutMs: 500
        })
      ).resolves.toBe('complete')
      await rewrite
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('retains the last transient file error when a text report never appears', async () => {
    const missingPath = join(tmpdir(), `cleancode-missing-${randomUUID()}.txt`)

    await expect(
      waitForTextFile(missingPath, { intervalMs: 5, timeoutMs: 20 })
    ).rejects.toMatchObject({
      cause: {
        code: 'ENOENT'
      }
    })
  })

  it('destroys a provider socket when the health response deadline expires', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cleancode-e2e-provider-health-'))
    const providerDirectory = join(directory, 'terminal-runtime-provider')
    const socket = createSocket()
    let resolveConnectionStarted!: () => void
    const connectionStarted = new Promise<void>((resolve) => {
      resolveConnectionStarted = resolve
    })

    try {
      await mkdir(providerDirectory, { recursive: true })
      connectSocket.mockImplementation(() => {
        resolveConnectionStarted()
        queueMicrotask(() => socket.emit('connect'))
        return socket
      })
      await writeFile(
        join(providerDirectory, 'provider.json'),
        JSON.stringify({
          authToken: 'test-token',
          endpoint: '/test/provider.sock',
          instanceId: 'test-instance',
          processId: 999_999
        }),
        'utf8'
      )

      vi.useFakeTimers()
      const metadata = readAuthenticatedTerminalProviderMetadata(directory)
      const deadline = expect(metadata).resolves.toBeNull()
      await connectionStarted
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2_000)
      await deadline

      expect(socket.destroy).toHaveBeenCalledOnce()
      expect(socket.destroyed).toBe(true)
    } finally {
      vi.useRealTimers()
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function createElectronProcess(): MutableElectronProcess {
  const electronProcess = new EventEmitter() as MutableElectronProcess

  electronProcess.exitCode = null
  electronProcess.signalCode = null
  electronProcess.pid = 123
  electronProcess.kill = vi.fn(() => true)

  return electronProcess
}

function createSocket(): MutableSocket {
  const socket = new EventEmitter() as MutableSocket

  socket.destroyed = false
  socket.destroy = vi.fn(() => {
    socket.destroyed = true
    socket.emit('close')
    return socket
  })
  socket.write = vi.fn(() => true)

  return socket
}
