import { EventEmitter } from 'node:events'

import type { Logger } from '../../../src/platform/logging/Logger'
import type { IpcInvokeResult } from '../../../src/platform/ipc/registerIpcHandler'
import { windowFullScreenStateChannels } from '../../../src/platform/ipc/windowFullScreenStateChannels'
import {
  bindWindowFullScreenState,
  registerWindowFullScreenStateIpc
} from '../../../src/platform/electron-main/windowFullScreenState'

class FakeWindow extends EventEmitter {
  readonly send = vi.fn()
  readonly webContents = {
    isDestroyed: () => this.isWebContentsDestroyed,
    send: this.send
  }
  isDestroyedValue = false
  isFullScreenValue = false
  isWebContentsDestroyed = false

  isDestroyed(): boolean {
    return this.isDestroyedValue
  }

  isFullScreen(): boolean {
    return this.isFullScreenValue
  }
}

class FakeIpcMain {
  readonly handlers = new Map<
    string,
    (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  >()

  handle(
    channel: string,
    listener: (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  ): void {
    this.handlers.set(channel, listener)
  }

  invoke<TResult>(channel: string, event: unknown): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)

    return handler(event) as Promise<IpcInvokeResult<TResult>>
  }
}

const silentLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}

describe('platform window fullscreen state', () => {
  it('publishes native fullscreen transitions and removes window-owned listeners on close', () => {
    const target = new FakeWindow()

    bindWindowFullScreenState(target)
    target.emit('enter-full-screen')
    target.emit('leave-full-screen')

    expect(target.send.mock.calls).toEqual([
      [windowFullScreenStateChannels.changed, true],
      [windowFullScreenStateChannels.changed, false]
    ])

    target.emit('closed')
    target.emit('enter-full-screen')
    expect(target.send).toHaveBeenCalledTimes(2)
    expect(target.listenerCount('enter-full-screen')).toBe(0)
    expect(target.listenerCount('leave-full-screen')).toBe(0)
  })

  it('reads the initial state from the BrowserWindow that owns the invoking renderer', async () => {
    const ipcMain = new FakeIpcMain()
    const target = new FakeWindow()
    target.isFullScreenValue = true
    const rendererEvent = { sender: 'renderer-web-contents' }
    const resolveWindow = vi.fn(() => target)

    registerWindowFullScreenStateIpc({ ipcMain, logger: silentLogger, resolveWindow })

    await expect(
      ipcMain.invoke<boolean>(windowFullScreenStateChannels.get, rendererEvent)
    ).resolves.toEqual({ ok: true, value: true })
    expect(resolveWindow).toHaveBeenCalledWith(rendererEvent)
  })
})
