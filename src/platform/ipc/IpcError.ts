import { AppError, type AppErrorDetails } from '../../shared-kernel/domain/errors/AppError'

export const ipcErrorCodes = ['INVALID_IPC_COMMAND'] as const
type IpcErrorCode = (typeof ipcErrorCodes)[number]
export class IpcError extends AppError<IpcErrorCode> {
  constructor(code: IpcErrorCode, message: string, details?: AppErrorDetails) {
    super({ code, message, details, isExpected: true })
    this.name = 'IpcError'
  }
}
export function createIpcError(
  code: IpcErrorCode,
  message: string,
  details?: AppErrorDetails
): IpcError {
  return new IpcError(code, message, details)
}
