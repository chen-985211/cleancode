import {
  AppError,
  createExpectedAppError,
  isCommonErrorCode,
  type CommonErrorCode,
  type AppErrorDetails
} from '../../../../shared-kernel/domain/errors/AppError'
import {
  canvasArrangementDomainErrorCodes,
  isCanvasArrangementDomainErrorCode,
  type CanvasArrangementDomainErrorCode
} from '../../domain/errors/CanvasArrangementDomainError'

const canvasArrangementApplicationErrorCodes = [
  'CANVAS_ARRANGEMENT_CORRUPTED',
  'CANVAS_ARRANGEMENT_SCOPE_MISMATCH',
  'CANVAS_ARRANGEMENT_VERSION_UNSUPPORTED'
] as const

type CanvasArrangementApplicationErrorCode = (typeof canvasArrangementApplicationErrorCodes)[number]
export const canvasArrangementErrorCodes = [
  ...canvasArrangementDomainErrorCodes,
  ...canvasArrangementApplicationErrorCodes
] as const
export type CanvasArrangementErrorCode =
  CanvasArrangementDomainErrorCode | CanvasArrangementApplicationErrorCode | CommonErrorCode
const codes = new Set<string>(canvasArrangementApplicationErrorCodes)

export function isCanvasArrangementErrorCode(code: unknown): code is CanvasArrangementErrorCode {
  return (
    isCommonErrorCode(code) ||
    isCanvasArrangementDomainErrorCode(code) ||
    (typeof code === 'string' && codes.has(code))
  )
}

export class CanvasArrangementApplicationError extends AppError<
  CanvasArrangementApplicationErrorCode | CanvasArrangementDomainErrorCode
> {
  readonly context = 'canvas-arrangement'
  constructor(
    code: CanvasArrangementApplicationErrorCode | CanvasArrangementDomainErrorCode,
    message: string,
    details?: AppErrorDetails
  ) {
    super({ code, message, details, isExpected: true })
    this.name = 'CanvasArrangementApplicationError'
  }
}

export function createCanvasArrangementError(
  code: CanvasArrangementErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError<CanvasArrangementErrorCode> {
  if (isCommonErrorCode(code)) return createExpectedAppError(code, message, details)
  return new CanvasArrangementApplicationError(code, message, details)
}
