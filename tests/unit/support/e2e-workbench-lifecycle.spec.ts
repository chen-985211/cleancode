// @vitest-environment node

import { EventEmitter } from 'node:events'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import type { ElectronApplication } from 'playwright'

const launchElectron = vi.hoisted(() => vi.fn())

vi.mock('playwright', () => ({
  _electron: {
    launch: launchElectron
  }
}))

import {
  closeElectronApp,
  launchApp,
  teardownE2eScenario,
  type E2eWorkbench
} from '../../support/e2eWorkbench'
import { runE2eTeardown } from '../../support/e2eLifecycle'

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

describe('E2E workbench lifecycle', () => {
  beforeEach(() => {
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
})

function createElectronProcess(): MutableElectronProcess {
  const electronProcess = new EventEmitter() as MutableElectronProcess

  electronProcess.exitCode = null
  electronProcess.signalCode = null
  electronProcess.pid = 123
  electronProcess.kill = vi.fn(() => true)

  return electronProcess
}
