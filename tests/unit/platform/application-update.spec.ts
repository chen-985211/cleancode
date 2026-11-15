import { EventEmitter } from 'node:events'
import { createApplicationUpdateService } from '../../../src/platform/electron-main/applicationUpdateService'

function harness() {
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => {
      updater.emit('update-available', { version: '0.2.0' })
    }),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn()
  })
  const prepareRestart = vi.fn<() => Promise<void>>(async () => undefined)
  const service = createApplicationUpdateService({ updater, prepareRestart })
  return { updater, prepareRestart, service }
}

describe('application updates', () => {
  it('downloads an available release and waits for verified download completion before allowing install', async () => {
    const { updater, service } = harness()
    await service.check()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    expect(service.getSnapshot()).toMatchObject({ status: 'downloading', version: '0.2.0' })
    updater.emit('download-progress', { percent: 42.7 })
    expect(service.getSnapshot()).toMatchObject({ status: 'downloading', percent: 42.7 })
    updater.emit('download-progress', { percent: 100 })
    expect(service.getSnapshot().status).toBe('verifying')
    await service.install('0.2.0')
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    updater.emit('update-downloaded', { version: '0.2.0' })
    expect(service.getSnapshot().status).toBe('ready')
    await service.install('0.2.0')
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true)
  })

  it('coalesces checks, ignores regressing progress and ignores late events after readiness', async () => {
    const { updater, service } = harness()
    await Promise.all([service.check(), service.check()])
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    updater.emit('download-progress', { percent: 75 })
    updater.emit('download-progress', { percent: 25 })
    updater.emit('download-progress', { percent: NaN })
    expect(service.getSnapshot().percent).toBe(75)
    updater.emit('update-downloaded', { version: '0.2.0' })
    updater.emit('download-progress', { percent: 99 })
    updater.emit('update-downloaded', { version: '0.1.0' })
    expect(service.getSnapshot()).toMatchObject({ status: 'ready', version: '0.2.0', percent: 100 })
    await service.check()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('requires confirmation of the exact ready version and finishes runtime shutdown before installing once', async () => {
    const { updater, prepareRestart, service } = harness()
    let finish: () => void = () => undefined
    prepareRestart.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    await service.check()
    updater.emit('update-downloaded', { version: '0.2.0' })
    await service.install('0.1.0')
    expect(prepareRestart).not.toHaveBeenCalled()
    const installing = service.install('0.2.0')
    await service.install('0.2.0')
    expect(prepareRestart).toHaveBeenCalledOnce()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    finish()
    await installing
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('retains failures for retry and releases every listener on disposal', async () => {
    const { updater, service } = harness()
    updater.downloadUpdate.mockRejectedValueOnce(new Error('network'))
    await service.check()
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'download' })
    await service.check()
    updater.emit('update-downloaded', { version: '0.2.0' })
    const listener = vi.fn()
    const unsubscribe = service.subscribe(listener)
    unsubscribe()
    service.dispose()
    expect(updater.eventNames()).toEqual([])
    updater.emit('download-progress', { percent: 25 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('allows retrying a failed install of the same verified version', async () => {
    const { updater, service } = harness()
    await service.check()
    updater.emit('update-downloaded', { version: '0.2.0' })
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('installer failed')
    })
    await service.install('0.2.0')
    expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'install' })
    await service.install('0.2.0')
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(2)
    expect(service.getSnapshot().status).toBe('installing')
  })
})
