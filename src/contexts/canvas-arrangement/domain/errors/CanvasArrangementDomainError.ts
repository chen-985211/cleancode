import { AppError, type AppErrorDetails } from '../../../../shared-kernel/domain/errors/AppError'

export const canvasArrangementDomainErrorCodes = [
  'CANVAS_ARRANGEMENT_INVALID',
  'CANVAS_STACK_NOT_FOUND'
] as const

export type CanvasArrangementDomainErrorCode = (typeof canvasArrangementDomainErrorCodes)[number]
const codes = new Set<string>(canvasArrangementDomainErrorCodes)

export function isCanvasArrangementDomainErrorCode(
  code: unknown
): code is CanvasArrangementDomainErrorCode {
  return typeof code === 'string' && codes.has(code)
}

export class CanvasArrangementDomainError extends AppError<CanvasArrangementDomainErrorCode> {
  readonly context = 'canvas-arrangement'
  constructor(code: CanvasArrangementDomainErrorCode, message: string, details?: AppErrorDetails) {
    super({ code, message, details, isExpected: true })
    this.name = 'CanvasArrangementDomainError'
  }
}

export function createCanvasArrangementDomainError(
  code: CanvasArrangementDomainErrorCode,
  message: string,
  details?: AppErrorDetails
): CanvasArrangementDomainError {
  return new CanvasArrangementDomainError(code, message, details)
}
