import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { applicationRepositoryStarsChannel } from '../ipc/applicationRepositoryChannels'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export function registerApplicationRepositoryStarsIpc(input: {
  readonly ipcMain: IpcMainLike
  readonly isTrustedSender: (event: unknown) => boolean
  readonly logger: Logger
  readonly read: () => Promise<number>
}): void {
  registerIpcHandler<unknown, number>({
    channel: applicationRepositoryStarsChannel,
    handler: (command, event) => {
      if (command !== undefined || !input.isTrustedSender(event)) {
        throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid repository stars IPC query.')
      }
      return input.read()
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getApplicationRepositoryStars',
    scope: 'platform.application-repository'
  })
}
