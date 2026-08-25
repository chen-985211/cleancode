import type { Logger } from '../../../src/platform/logging/Logger'
import type { IpcInvokeResult } from '../../../src/platform/ipc/registerIpcHandler'
import { applicationQuitChannels } from '../../../src/platform/ipc/applicationQuitChannels'
import {
  createApplicationQuitConfirmationCoordinator,
  registerApplicationQuitConfirmationIpc
} from '../../../src/platform/electron-main/applicationQuitConfirmation'

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

  invoke<TResult>(
    channel: string,
    event: unknown,
    command?: unknown
  ): Promise<IpcInvokeResult<TResult>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for ${channel}`)

    return handler(event, command) as Promise<IpcInvokeResult<TResult>>
  }
}

const command = {
  cancelLabel: '取消',
  confirmLabel: '退出',
  message: '退出 cleancode？',
  requestId: 'quit-request-1'
}

function quitTarget() {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn()
    }
  }
}

const silentLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}

describe('application quit IPC contract', () => {
  it('shows the native dialog only for the renderer that owns the pending request', async () => {
    const ipcMain = new FakeIpcMain()
    const target = quitTarget()
    const otherTarget = quitTarget()
    const quit = vi.fn()
    const showDialog = vi.fn().mockResolvedValue(1)
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit,
      showDialog
    })
    const resolveTarget = vi.fn((event: unknown) =>
      event === 'owning-renderer' ? target : otherTarget
    )
    registerApplicationQuitConfirmationIpc({
      coordinator,
      ipcMain,
      logger: silentLogger,
      resolveTarget
    })
    coordinator.request(target)

    await expect(
      ipcMain.invoke<boolean>(applicationQuitChannels.show, 'other-renderer', command)
    ).resolves.toEqual({ ok: true, value: false })
    await expect(
      ipcMain.invoke<boolean>(applicationQuitChannels.show, 'owning-renderer', command)
    ).resolves.toEqual({ ok: true, value: true })

    expect(showDialog).toHaveBeenCalledWith(target, {
      cancelLabel: '取消',
      confirmLabel: '退出',
      message: '退出 cleancode？'
    })
    expect(quit).toHaveBeenCalledOnce()
  })

  it('rejects malformed copy without changing pending confirmation state', async () => {
    const ipcMain = new FakeIpcMain()
    const target = quitTarget()
    const quit = vi.fn()
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit,
      showDialog: vi.fn().mockResolvedValue(1)
    })
    registerApplicationQuitConfirmationIpc({
      coordinator,
      ipcMain,
      logger: silentLogger,
      resolveTarget: () => target
    })
    coordinator.request(target)

    await expect(
      ipcMain.invoke<boolean>(applicationQuitChannels.show, 'owning-renderer', {
        requestId: 'quit-request-1'
      })
    ).resolves.toEqual({ ok: true, value: false })
    await expect(
      ipcMain.invoke<boolean>(applicationQuitChannels.show, 'owning-renderer', command)
    ).resolves.toEqual({ ok: true, value: true })

    expect(quit).toHaveBeenCalledOnce()
  })
})
