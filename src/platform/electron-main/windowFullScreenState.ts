import type { Logger } from '../logging/Logger'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import { windowFullScreenStateChannels } from '../ipc/windowFullScreenStateChannels'

interface WindowFullScreenStateTarget {
  readonly webContents: {
    isDestroyed(): boolean
    send(channel: string, payload: unknown): void
  }
  isDestroyed(): boolean
  isFullScreen(): boolean
  on(event: string, listener: () => void): unknown
  removeListener(event: string, listener: () => void): unknown
}

export function bindWindowFullScreenState(target: WindowFullScreenStateTarget): () => void {
  const publish = (isFullScreen: boolean): void => {
    if (target.isDestroyed() || target.webContents.isDestroyed()) return

    target.webContents.send(windowFullScreenStateChannels.changed, isFullScreen)
  }
  const onEnterFullScreen = (): void => publish(true)
  const onLeaveFullScreen = (): void => publish(false)
  const dispose = (): void => {
    target.removeListener('enter-full-screen', onEnterFullScreen)
    target.removeListener('leave-full-screen', onLeaveFullScreen)
    target.removeListener('closed', dispose)
  }

  target.on('enter-full-screen', onEnterFullScreen)
  target.on('leave-full-screen', onLeaveFullScreen)
  target.on('closed', dispose)

  return dispose
}

export function registerWindowFullScreenStateIpc(input: {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly resolveWindow: (
    event: unknown
  ) => Pick<WindowFullScreenStateTarget, 'isFullScreen'> | null
}): void {
  registerIpcHandler<undefined, boolean>({
    channel: windowFullScreenStateChannels.get,
    handler: (_command, event) => input.resolveWindow(event)?.isFullScreen() ?? false,
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getWindowFullScreenState',
    scope: 'platform.window'
  })
}
