import { EventEmitter } from 'node:events'
import {
  bindDesktopWindowState,
  registerDesktopWindowIpc
} from '../../../src/platform/electron-main/desktopWindowControls'
import {
  desktopWindowChannels,
  supportsSnapLayouts
} from '../../../src/platform/ipc/desktopWindowControls'
import type { IpcInvokeResult, IpcMainLike } from '../../../src/platform/ipc/registerIpcHandler'

function createWindow() {
  return Object.assign(new EventEmitter(), {
    close: vi.fn(),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isFocused: vi.fn(() => true),
    isMaximized: vi.fn(() => false),
    isFullScreen: () => false,
    isDestroyed: () => false,
    getNativeWindowHandle: () => Buffer.alloc(8),
    webContents: { isDestroyed: () => false, send: vi.fn() }
  })
}

describe('desktop window controls', () => {
  it('exposes system Snap hover only on Windows builds with Snap Layouts', () => {
    expect(supportsSnapLayouts('win32', '10.0.19045')).toBe(false)
    expect(supportsSnapLayouts('win32', '10.0.22000')).toBe(true)
    expect(supportsSnapLayouts('win32', '10.0.26100')).toBe(true)
    expect(supportsSnapLayouts('linux', '10.0.26100')).toBe(false)
  })

  it('targets the sending window and checks its live state for every action', async () => {
    const target = createWindow()
    const sender = {}
    const handlers = new Map<string, Parameters<IpcMainLike['handle']>[1]>()
    registerDesktopWindowIpc({
      ipcMain: {
        handle: (channel, listener) => {
          handlers.set(channel, listener)
        }
      },
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      resolveWindow: (event) => (event === sender ? target : null)
    })
    const invoke = (
      channel: string,
      command?: unknown,
      event: unknown = sender
    ): Promise<IpcInvokeResult<unknown>> => handlers.get(channel)!(event, command)
    await invoke(desktopWindowChannels.perform, 'toggle-maximize')
    target.isMaximized.mockReturnValue(true)
    await expect(invoke(desktopWindowChannels.readState)).resolves.toEqual({
      ok: true,
      value: { maximized: true, focused: true }
    })
    await invoke(desktopWindowChannels.perform, 'toggle-maximize')
    await invoke(desktopWindowChannels.perform, 'minimize')
    await invoke(desktopWindowChannels.perform, 'close')
    await invoke(desktopWindowChannels.perform, 'close', {})
    await expect(invoke(desktopWindowChannels.perform, 'destroy')).resolves.toMatchObject({
      ok: false
    })
    expect(target.maximize).toHaveBeenCalledOnce()
    expect(target.unmaximize).toHaveBeenCalledOnce()
    expect(target.minimize).toHaveBeenCalledOnce()
    expect(target.close).toHaveBeenCalledOnce()
  })

  it('publishes external maximize and restore until the native window closes', () => {
    const target = createWindow()
    bindDesktopWindowState(target)
    target.isMaximized.mockReturnValue(true)
    target.emit('maximize')
    target.isFocused.mockReturnValue(false)
    target.emit('blur')
    target.isMaximized.mockReturnValue(false)
    target.emit('unmaximize')
    target.emit('closed')
    target.emit('maximize')
    expect(target.webContents.send.mock.calls).toEqual([
      [desktopWindowChannels.stateChanged, { maximized: true, focused: true }],
      [desktopWindowChannels.stateChanged, { maximized: true, focused: false }],
      [desktopWindowChannels.stateChanged, { maximized: false, focused: false }]
    ])
  })
})
