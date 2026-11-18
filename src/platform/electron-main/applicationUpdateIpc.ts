import { createIpcError } from '../ipc/IpcError'

import { applicationUpdateChannels } from '../ipc/applicationUpdateChannels'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import type { createApplicationUpdateService } from './applicationUpdateService'

export function registerApplicationUpdateIpc(input: {
  readonly ipcMain: IpcMainLike
  readonly isTrustedSender: (event: unknown) => boolean
  readonly logger: Logger
  readonly service: ReturnType<typeof createApplicationUpdateService>
}): void {
  for (const action of ['get', 'check', 'install', 'claimPrompt'] as const) {
    registerIpcHandler({
      ipcMain: input.ipcMain,
      logger: input.logger,
      channel: applicationUpdateChannels[action],
      scope: 'platform.application-update',
      operation: `${action}ApplicationUpdate`,
      handler: (command: unknown, event) => {
        if (!input.isTrustedSender(event)) throw invalidCommand()
        if (action === 'install' || action === 'claimPrompt') {
          if (
            typeof command !== 'object' ||
            command === null ||
            !('version' in command) ||
            typeof command.version !== 'string' ||
            command.version.length > 80 ||
            Object.keys(command).length !== 1
          )
            throw invalidCommand()
          return action === 'install'
            ? input.service.install(command.version)
            : input.service.claimPrompt(command.version)
        }
        if (command !== undefined) throw invalidCommand()
        return action === 'get' ? input.service.getSnapshot() : input.service.check()
      }
    })
  }
}

function invalidCommand() {
  return createIpcError('INVALID_IPC_COMMAND', 'Invalid application update command.')
}
