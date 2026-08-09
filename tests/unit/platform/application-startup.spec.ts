import { describe, expect, it, vi } from 'vitest'

import { startApplicationAfterElectronReady } from '../../../src/platform/electron-main/applicationStartup'

describe('application startup', () => {
  it('creates the first window before waiting for Run runtime initialization', async () => {
    const calls: string[] = []
    let finishInitialization: (() => void) | undefined
    const initialization = new Promise<void>((resolve) => {
      finishInitialization = resolve
    })

    const startup = startApplicationAfterElectronReady({
      createWindow: () => calls.push('window'),
      initializeRunRuntime: () => {
        calls.push('runtime')
        return initialization
      },
      onRunRuntimeInitializationFailure: vi.fn()
    })

    expect(calls).toEqual(['window', 'runtime'])
    finishInitialization?.()
    await startup
  })

  it('reports background Run runtime initialization failures without closing the window', async () => {
    const failure = new Error('runtime unavailable')
    const createWindow = vi.fn()
    const onRunRuntimeInitializationFailure = vi.fn()

    await startApplicationAfterElectronReady({
      createWindow,
      initializeRunRuntime: () => Promise.reject(failure),
      onRunRuntimeInitializationFailure
    })

    expect(createWindow).toHaveBeenCalledOnce()
    expect(onRunRuntimeInitializationFailure).toHaveBeenCalledWith(failure)
  })
})
