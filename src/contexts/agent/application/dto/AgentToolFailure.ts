import {
  createUnexpectedAppError,
  isAppError
} from '../../../../shared-kernel/application/errors/AppError'
import type { AgentToolStructuredContent } from './AgentToolProtocol'

type FailedAgentToolResult = Extract<AgentToolStructuredContent, { readonly status: 'failed' }>

export function createAgentToolFailedResult(
  toolCallId: string,
  error: unknown
): FailedAgentToolResult {
  const appError = isAppError(error) && error.isExpected ? error : createUnexpectedAppError()
  return {
    error: {
      code: appError.code,
      ...(appError.details ? { details: appError.details } : {}),
      isExpected: appError.isExpected,
      message: appError.message
    },
    status: 'failed',
    toolCallId
  }
}
