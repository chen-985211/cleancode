import {
  AppError,
  createExpectedAppError,
  isCommonErrorCode,
  type CommonErrorCode,
  type AppErrorDetails
} from '../../../../shared-kernel/domain/errors/AppError'
import {
  blockGraphDomainErrorCodes,
  isBlockGraphDomainErrorCode,
  type BlockGraphDomainErrorCode
} from '../../domain/errors/BlockGraphDomainError'

const blockGraphApplicationErrorCodes = [
  'BLOCK_GRAPH_NOT_FOUND',
  'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
  'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED',
  'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID',
  'TERMINAL_GROUP_REQUIRES_TWO_EXECUTION_UNITS',
  'TERMINAL_GROUP_REQUIRES_TWO_MEMBERS',
  'TERMINAL_LAYOUT_ANCHOR_REQUIRED',
  'TERMINAL_WORKFLOW_DEFINITION_INVALID'
] as const

type BlockGraphApplicationErrorCode = (typeof blockGraphApplicationErrorCodes)[number]
export const blockGraphErrorCodes = [
  ...blockGraphDomainErrorCodes,
  ...blockGraphApplicationErrorCodes
] as const
export type BlockGraphErrorCode =
  BlockGraphDomainErrorCode | BlockGraphApplicationErrorCode | CommonErrorCode
const codes = new Set<string>(blockGraphApplicationErrorCodes)

export function isBlockGraphErrorCode(code: unknown): code is BlockGraphErrorCode {
  return (
    isCommonErrorCode(code) ||
    isBlockGraphDomainErrorCode(code) ||
    (typeof code === 'string' && codes.has(code))
  )
}

export class BlockGraphApplicationError extends AppError<
  BlockGraphApplicationErrorCode | BlockGraphDomainErrorCode
> {
  readonly context = 'block-graph'
  constructor(
    code: BlockGraphApplicationErrorCode | BlockGraphDomainErrorCode,
    message: string,
    details?: AppErrorDetails
  ) {
    super({ code, message, details, isExpected: true })
    this.name = 'BlockGraphApplicationError'
  }
}

export function createBlockGraphError(
  code: BlockGraphErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError<BlockGraphErrorCode> {
  if (isCommonErrorCode(code)) return createExpectedAppError(code, message, details)
  return new BlockGraphApplicationError(code, message, details)
}
