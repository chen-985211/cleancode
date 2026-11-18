import {
  AppError,
  createExpectedAppError,
  isCommonErrorCode,
  type CommonErrorCode,
  type AppErrorDetails
} from '../../../../shared-kernel/domain/errors/AppError'
import {
  agentDomainErrorCodes,
  isAgentDomainErrorCode,
  type AgentDomainErrorCode
} from '../../domain/errors/AgentDomainError'

const agentApplicationErrorCodes = [
  'AGENT_CREATION_CONFLICT',
  'AGENT_PROVIDER_ARGUMENTS_INVALID',
  'AGENT_PROVIDER_DISABLED',
  'AGENT_PROVIDER_DUPLICATE',
  'AGENT_PROVIDER_INVALID',
  'AGENT_PROVIDER_NOT_FOUND',
  'AGENT_PROVIDER_UNAVAILABLE',
  'AGENT_SESSION_NOT_FOUND',
  'AGENT_TASK_PLANNING_FAILED',
  'AGENT_TASK_PLAN_INVALID',
  'AGENT_TOOL_UNAVAILABLE',
  'AGENT_WORKSPACE_SCOPE_STALE',
  'TERMINAL_BLOCK_NOT_FOUND',
  'TERMINAL_RUNTIME_NOT_READY',
  'TERMINAL_SESSION_NOT_FOUND',
  'WORKSPACE_DIRECTORY_IN_USE'
] as const

type AgentApplicationErrorCode = (typeof agentApplicationErrorCodes)[number]
export const agentErrorCodes = [...agentDomainErrorCodes, ...agentApplicationErrorCodes] as const
export type AgentErrorCode = AgentDomainErrorCode | AgentApplicationErrorCode | CommonErrorCode
const codes = new Set<string>(agentApplicationErrorCodes)

export function isAgentErrorCode(code: unknown): code is AgentErrorCode {
  return (
    isCommonErrorCode(code) ||
    isAgentDomainErrorCode(code) ||
    (typeof code === 'string' && codes.has(code))
  )
}

export class AgentApplicationError extends AppError<
  AgentApplicationErrorCode | AgentDomainErrorCode
> {
  readonly context = 'agent'
  constructor(
    code: AgentApplicationErrorCode | AgentDomainErrorCode,
    message: string,
    details?: AppErrorDetails
  ) {
    super({ code, message, details, isExpected: true })
    this.name = 'AgentApplicationError'
  }
}

export function createAgentError(
  code: AgentErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError<AgentErrorCode> {
  if (isCommonErrorCode(code)) return createExpectedAppError(code, message, details)
  return new AgentApplicationError(code, message, details)
}
