import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'

import { applicationQuitChannels } from '../../../src/platform/ipc/applicationQuitChannels'
import {
  bindApplicationQuitConfirmationToWindow,
  createApplicationQuitConfirmationCoordinator,
  createNativeApplicationQuitDialogOptions
} from '../../../src/platform/electron-main/applicationQuitConfirmation'

const dialogCopy = {
  cancelLabel: '取消',
  confirmLabel: '退出',
  message: '退出 cleancode？'
}

function confirmationCommand(requestId = 'quit-request-1') {
  return { requestId, ...dialogCopy }
}

function quitTarget() {
  const send = vi.fn()
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send
    },
    send
  }
}

describe('application quit confirmation', () => {
  it('builds a minimal native dialog with cancel as the default and escape action', () => {
    expect(createNativeApplicationQuitDialogOptions(dialogCopy)).toEqual({
      buttons: ['取消', '退出'],
      cancelId: 0,
      defaultId: 0,
      message: '退出 cleancode？',
      noLink: true,
      type: 'none'
    })
  })

  it('binds the shortcut to its window and releases pending state when the window closes', async () => {
    const webContents = new EventEmitter() as EventEmitter & {
      isDestroyed(): boolean
      send: ReturnType<typeof vi.fn>
    }
    webContents.isDestroyed = () => false
    webContents.send = vi.fn<(channel: string, payload: unknown) => void>()
    const target = new EventEmitter() as EventEmitter & {
      isDestroyed(): boolean
      webContents: typeof webContents
    }
    target.isDestroyed = () => false
    target.webContents = webContents
    const quit = vi.fn()
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit,
      showDialog: vi.fn().mockResolvedValue(1)
    })
    const preventDefault = vi.fn()

    const browserWindow = target as unknown as BrowserWindow
    bindApplicationQuitConfirmationToWindow({
      coordinator,
      platform: 'linux',
      target: browserWindow
    })
    webContents.emit(
      'before-input-event',
      { preventDefault },
      {
        alt: false,
        control: true,
        isAutoRepeat: false,
        isComposing: false,
        key: 'q',
        meta: false,
        shift: false,
        type: 'keyDown'
      }
    )
    target.emit('closed')

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(webContents.send).toHaveBeenCalledWith(applicationQuitChannels.requested, {
      requestId: 'quit-request-1'
    })
    await expect(coordinator.show(confirmationCommand(), browserWindow)).resolves.toBe(false)
    expect(webContents.listenerCount('before-input-event')).toBe(0)
    expect(quit).not.toHaveBeenCalled()
  })

  it('publishes only one pending confirmation across repeated shortcut requests', () => {
    const target = quitTarget()
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit: vi.fn(),
      showDialog: vi.fn()
    })

    coordinator.request(target)
    coordinator.request(target)

    expect(target.send).toHaveBeenCalledOnce()
    expect(target.send).toHaveBeenCalledWith(applicationQuitChannels.requested, {
      requestId: 'quit-request-1'
    })
  })

  it('keeps only one native dialog open for repeated renderer requests', async () => {
    const target = quitTarget()
    let resolveDialog: ((response: number) => void) | undefined
    const showDialog = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          resolveDialog = resolve
        })
    )
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit: vi.fn(),
      showDialog
    })

    coordinator.request(target)
    const firstResult = coordinator.show(confirmationCommand(), target)
    await expect(coordinator.show(confirmationCommand(), target)).resolves.toBe(false)

    expect(showDialog).toHaveBeenCalledOnce()
    resolveDialog?.(0)
    await expect(firstResult).resolves.toBe(true)
  })

  it('cancels natively without quitting and allows the next shortcut request', async () => {
    const target = quitTarget()
    const quit = vi.fn()
    const requestIds = ['quit-request-1', 'quit-request-2']
    const showDialog = vi.fn().mockResolvedValue(0)
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => requestIds.shift() ?? 'unexpected-request',
      quit,
      showDialog
    })

    coordinator.request(target)
    await expect(coordinator.show(confirmationCommand(), target)).resolves.toBe(true)
    coordinator.request(target)

    expect(showDialog).toHaveBeenCalledWith(target, dialogCopy)
    expect(quit).not.toHaveBeenCalled()
    expect(target.send).toHaveBeenLastCalledWith(applicationQuitChannels.requested, {
      requestId: 'quit-request-2'
    })
  })

  it('quits exactly once only for the matching request and renderer', async () => {
    const target = quitTarget()
    const otherTarget = quitTarget()
    const quit = vi.fn()
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit,
      showDialog: vi.fn().mockResolvedValue(1)
    })

    coordinator.request(target)

    await expect(coordinator.show(confirmationCommand('wrong-request'), target)).resolves.toBe(
      false
    )
    await expect(coordinator.show(confirmationCommand(), otherTarget)).resolves.toBe(false)
    await expect(coordinator.show(confirmationCommand(), target)).resolves.toBe(true)
    await expect(coordinator.show(confirmationCommand(), target)).resolves.toBe(false)
    expect(quit).toHaveBeenCalledOnce()
  })

  it('ignores a dialog result after its renderer is released', async () => {
    const target = quitTarget()
    const quit = vi.fn()
    let resolveDialog: ((response: number) => void) | undefined
    const coordinator = createApplicationQuitConfirmationCoordinator({
      createRequestId: () => 'quit-request-1',
      quit,
      showDialog: () =>
        new Promise<number>((resolve) => {
          resolveDialog = resolve
        })
    })

    coordinator.request(target)
    const result = coordinator.show(confirmationCommand(), target)
    coordinator.release(target)
    resolveDialog?.(1)

    await expect(result).resolves.toBe(false)
    expect(quit).not.toHaveBeenCalled()
  })
})
