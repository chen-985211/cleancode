import { randomUUID } from 'node:crypto'
import {
  BrowserWindow,
  dialog,
  type App,
  type IpcMainInvokeEvent,
  type MessageBoxOptions
} from 'electron'

import {
  applicationQuitChannels,
  isApplicationQuitConfirmationCommand,
  type ApplicationQuitConfirmationCommand,
  type ApplicationQuitDialogCopy,
  type ApplicationQuitRequest
} from '../ipc/applicationQuitChannels'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import { bindApplicationQuitShortcut } from './applicationQuitShortcut'

const applicationQuitRendererResponseTimeoutMs = 5_000

export interface ApplicationQuitConfirmationTarget {
  isDestroyed(): boolean
  readonly webContents: {
    isDestroyed(): boolean
    send(channel: string, payload: unknown): void
  }
}

export interface ApplicationQuitConfirmationCoordinator {
  release(target: ApplicationQuitConfirmationTarget): void
  request(target: ApplicationQuitConfirmationTarget): boolean
  show(
    command: ApplicationQuitConfirmationCommand,
    target: ApplicationQuitConfirmationTarget | null
  ): Promise<boolean>
}

export function configureApplicationQuitConfirmation(input: {
  readonly app: Pick<App, 'quit'>
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
}): ApplicationQuitConfirmationCoordinator {
  const coordinator = createApplicationQuitConfirmationCoordinator({
    quit: () => input.app.quit(),
    showDialog: async (target, copy) => {
      const result = await dialog.showMessageBox(
        target as BrowserWindow,
        createNativeApplicationQuitDialogOptions(copy)
      )
      return result.response
    }
  })
  registerApplicationQuitConfirmationIpc({
    coordinator,
    ipcMain: input.ipcMain,
    logger: input.logger,
    resolveTarget: (event) => BrowserWindow.fromWebContents((event as IpcMainInvokeEvent).sender)
  })
  return coordinator
}

export function createNativeApplicationQuitDialogOptions(
  copy: ApplicationQuitDialogCopy
): MessageBoxOptions {
  return {
    buttons: [copy.cancelLabel, copy.confirmLabel],
    cancelId: 0,
    defaultId: 0,
    message: copy.message,
    noLink: true,
    type: 'none'
  }
}

export function bindApplicationQuitConfirmationToWindow(input: {
  readonly coordinator: ApplicationQuitConfirmationCoordinator
  readonly platform: NodeJS.Platform
  readonly target: BrowserWindow
}): () => void {
  const disposeShortcut = bindApplicationQuitShortcut({
    platform: input.platform,
    requestConfirmation: () => input.coordinator.request(input.target),
    target: input.target.webContents
  })
  const dispose = (): void => {
    disposeShortcut()
    input.coordinator.release(input.target)
    input.target.removeListener('closed', dispose)
  }

  input.target.once('closed', dispose)
  return dispose
}

export function registerApplicationQuitConfirmationIpc(input: {
  readonly coordinator: ApplicationQuitConfirmationCoordinator
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly resolveTarget: (event: unknown) => ApplicationQuitConfirmationTarget | null
}): void {
  registerIpcHandler<unknown, boolean>({
    channel: applicationQuitChannels.show,
    handler: (command, event) =>
      isApplicationQuitConfirmationCommand(command)
        ? input.coordinator.show(command, input.resolveTarget(event))
        : false,
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'showApplicationQuitConfirmation',
    scope: 'platform.application'
  })
}

export function createApplicationQuitConfirmationCoordinator(input: {
  readonly createRequestId?: () => string
  readonly quit: () => void
  readonly showDialog: (
    target: ApplicationQuitConfirmationTarget,
    copy: ApplicationQuitDialogCopy
  ) => Promise<number>
}): ApplicationQuitConfirmationCoordinator {
  let pending:
    | {
        readonly cancelExpiry: () => void
        isShowing: boolean
        readonly request: ApplicationQuitRequest
        readonly target: ApplicationQuitConfirmationTarget
      }
    | undefined
  const createRequestId = input.createRequestId ?? randomUUID
  const clearPending = (activeConfirmation: NonNullable<typeof pending>): void => {
    if (pending !== activeConfirmation) return

    activeConfirmation.cancelExpiry()
    pending = undefined
  }

  return {
    release(target) {
      if (pending?.target === target) clearPending(pending)
    },
    request(target) {
      if (pending || target.isDestroyed() || target.webContents.isDestroyed()) return false

      const request = { requestId: createRequestId() }
      let cancelExpiry = (): void => undefined
      const activeConfirmation = {
        cancelExpiry: () => cancelExpiry(),
        isShowing: false,
        request,
        target
      }
      pending = activeConfirmation
      cancelExpiry = scheduleApplicationQuitRequestExpiry(() => clearPending(activeConfirmation))
      try {
        target.webContents.send(applicationQuitChannels.requested, request)
      } catch (error) {
        clearPending(activeConfirmation)
        throw error
      }
      return true
    },
    async show(command, target) {
      const activeConfirmation = pending
      if (
        activeConfirmation === undefined ||
        target === null ||
        activeConfirmation.target !== target ||
        activeConfirmation.request.requestId !== command.requestId ||
        activeConfirmation.isShowing
      ) {
        return false
      }

      activeConfirmation.isShowing = true
      activeConfirmation.cancelExpiry()
      try {
        const response = await input.showDialog(activeConfirmation.target, {
          cancelLabel: command.cancelLabel,
          confirmLabel: command.confirmLabel,
          message: command.message
        })
        if (pending !== activeConfirmation) return false

        clearPending(activeConfirmation)
        if (response === 1) input.quit()
        return true
      } catch (error) {
        clearPending(activeConfirmation)
        throw error
      }
    }
  }
}

function scheduleApplicationQuitRequestExpiry(expire: () => void): () => void {
  const timeout = setTimeout(expire, applicationQuitRendererResponseTimeoutMs)
  timeout.unref()
  return () => clearTimeout(timeout)
}
