import { EventEmitter } from 'node:events'
import { bindApplicationQuitLifecycle } from '../../../src/platform/electron-main/applicationQuitLifecycle'

describe('normal quit and update restart coordination', () => {
  it('allows a normal quit only after the shared cleanup completes', async () => {
    const app = Object.assign(new EventEmitter(), { quit: vi.fn() })
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
    const app = Object.assign(new EventEmitter(), { quit: vi.fn() })
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
})
