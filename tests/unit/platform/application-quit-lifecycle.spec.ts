import { EventEmitter } from 'node:events'
import { bindApplicationQuitLifecycle } from '../../../src/platform/electron-main/applicationQuitLifecycle'

describe('normal quit and update restart coordination', () => {
  it('allows a normal quit only after the shared cleanup completes', async () => {
    const app = Object.assign(new EventEmitter(), { quit: vi.fn(), relaunch: vi.fn() })
    const shutdown = vi.fn(async () => undefined)
    bindApplicationQuitLifecycle({ app, shutdown })
    const event = { preventDefault: vi.fn() }
    app.emit('before-quit', event)
    app.emit('before-quit', event)
    expect(shutdown).toHaveBeenCalledOnce()
    expect(app.quit).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(app.quit).toHaveBeenCalledOnce()
  })
  it('prevents an ordinary quit racing the confirmed update cleanup', async () => {
    const app = Object.assign(new EventEmitter(), { quit: vi.fn(), relaunch: vi.fn() })
    let finish: () => void = () => undefined
    const shutdown = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const lifecycle = bindApplicationQuitLifecycle({ app, shutdown })
    const restart = lifecycle.prepareUpdate()
    const event = { preventDefault: vi.fn() }
    app.emit('before-quit', event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(shutdown).toHaveBeenCalledOnce()
    finish()
    await restart
    expect(app.quit).not.toHaveBeenCalled()
    const installingQuit = { preventDefault: vi.fn() }
    app.emit('before-quit', installingQuit)
    expect(installingQuit.preventDefault).not.toHaveBeenCalled()
  })

  it.each([undefined, '/opt/cleancode/CleanCode.AppImage'])(
    'waits for update cleanup before restarting the current application once (executable=%s)',
    async (relaunchExecutable) => {
      const app = Object.assign(new EventEmitter(), { quit: vi.fn(), relaunch: vi.fn() })
      let finish: () => void = () => undefined
      const shutdown = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          })
      )
      const input = { app, shutdown, relaunchExecutable }
      const lifecycle = bindApplicationQuitLifecycle(input)
      const preparing = lifecycle.prepareUpdate()
      const firstRecovery = lifecycle.recoverFailedUpdate()
      const secondRecovery = lifecycle.recoverFailedUpdate()
      expect(app.relaunch).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
      finish()
      await Promise.all([preparing, firstRecovery, secondRecovery])
      expect(shutdown).toHaveBeenCalledOnce()
      expect(app.relaunch).toHaveBeenCalledExactlyOnceWith(
        relaunchExecutable ? { execPath: relaunchExecutable } : undefined
      )
      expect(app.quit).toHaveBeenCalledOnce()
      const quitting = { preventDefault: vi.fn() }
      app.emit('before-quit', quitting)
      expect(quitting.preventDefault).not.toHaveBeenCalled()
    }
  )

  it('does not turn an ordinary quit racing an update into an application restart', async () => {
    const app = Object.assign(new EventEmitter(), { quit: vi.fn(), relaunch: vi.fn() })
    const lifecycle = bindApplicationQuitLifecycle({
      app,
      shutdown: async () => undefined
    })
    app.emit('before-quit', { preventDefault: vi.fn() })
    await expect(lifecycle.prepareUpdate()).rejects.toThrow('shutdown is already in progress')
    await lifecycle.recoverFailedUpdate()
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('restarts the current application even when cleanup itself rejects', async () => {
    const app = Object.assign(new EventEmitter(), { quit: vi.fn(), relaunch: vi.fn() })
    const lifecycle = bindApplicationQuitLifecycle({
      app,
      shutdown: async () => {
        throw new Error('cleanup failed')
      }
    })
    const preparing = lifecycle.prepareUpdate()
    const rejected = expect(preparing).rejects.toThrow('cleanup failed')
    const recovery = lifecycle.recoverFailedUpdate()
    await rejected
    await recovery
    expect(app.relaunch).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('does not leave the disposed window open if scheduling the relaunch fails', async () => {
    const app = Object.assign(new EventEmitter(), {
      quit: vi.fn(),
      relaunch: vi.fn(() => {
        throw new Error('relaunch failed')
      })
    })
    const lifecycle = bindApplicationQuitLifecycle({ app, shutdown: async () => undefined })
    await lifecycle.prepareUpdate()
    await expect(lifecycle.recoverFailedUpdate()).rejects.toThrow('relaunch failed')
    await expect(lifecycle.recoverFailedUpdate()).rejects.toThrow('relaunch failed')
    expect(app.relaunch).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })
})
