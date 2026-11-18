import { AppError, type AppErrorDetails } from '../../../../shared-kernel/domain/errors/AppError'

export const blockGraphDomainErrorCodes = [
  'BLOCK_TEMPLATE_ALREADY_EXISTS',
  'BLOCK_TEMPLATE_INVALID',
  'BLOCK_TEMPLATE_NOT_FOUND',
  'BLOCK_TEMPLATE_VERSION_UNSUPPORTED',
  'QUICK_EXECUTION_BAR_FULL',
  'QUICK_EXECUTION_SLOT_INVALID',
  'QUICK_EXECUTION_TARGET_INVALID',
  'QUICK_EXECUTION_TARGET_NOT_FOUND',
  'TERMINAL_BLOCK_ALREADY_GROUPED',
  'TERMINAL_BLOCK_NAME_EMPTY',
  'TERMINAL_BLOCK_NOT_FOUND',
  'TERMINAL_BLOCK_NOT_IN_GROUP',
  'TERMINAL_CONNECTION_DUPLICATE',
  'TERMINAL_CONNECTION_INVALID',
  'TERMINAL_CONNECTION_NOT_FOUND',
  'TERMINAL_CONNECTION_SCOPE_MISMATCH',
  'TERMINAL_EXECUTION_CONFIG_INVALID',
  'TERMINAL_GROUP_LAYOUT_CONFLICT',
  'TERMINAL_GROUP_NAME_EMPTY',
  'TERMINAL_GROUP_NOT_FOUND',
  'TERMINAL_LAYOUT_PARTIAL_GROUP',
  'TERMINAL_LAYOUT_SCOPE_EMPTY',
  'TERMINAL_REMOVAL_SCOPE_STALE',
  'TERMINAL_SCOPE_MOVE_STALE',
  'TERMINAL_WORKFLOW_COMMAND_MISSING',
  'TERMINAL_WORKFLOW_CYCLE',
  'TERMINAL_WORKFLOW_EMPTY',
  'WORKSPACE_INITIALIZATION_CONFLICT'
] as const

export type BlockGraphDomainErrorCode = (typeof blockGraphDomainErrorCodes)[number]
const codes = new Set<string>(blockGraphDomainErrorCodes)

export function isBlockGraphDomainErrorCode(code: unknown): code is BlockGraphDomainErrorCode {
  return typeof code === 'string' && codes.has(code)
}

export class BlockGraphDomainError extends AppError<BlockGraphDomainErrorCode> {
  readonly context = 'block-graph'
  constructor(code: BlockGraphDomainErrorCode, message: string, details?: AppErrorDetails) {
    super({ code, message, details, isExpected: true })
    this.name = 'BlockGraphDomainError'
  }
}

export function createBlockGraphDomainError(
  code: BlockGraphDomainErrorCode,
  message: string,
  details?: AppErrorDetails
): BlockGraphDomainError {
  return new BlockGraphDomainError(code, message, details)
}
