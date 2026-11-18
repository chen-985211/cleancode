import { AppError, type AppErrorDetails } from '../../../../shared-kernel/domain/errors/AppError'

export const agentDomainErrorCodes = [
  'AGENT_PROVIDER_MISMATCH',
  'AGENT_SESSION_INVALID',
  'AGENT_TOOL_INPUT_INVALID'
] as const

export type AgentDomainErrorCode = (typeof agentDomainErrorCodes)[number]
const codes = new Set<string>(agentDomainErrorCodes)

export function isAgentDomainErrorCode(code: unknown): code is AgentDomainErrorCode {
  return typeof code === 'string' && codes.has(code)
}

export class AgentDomainError extends AppError<AgentDomainErrorCode> {
  readonly context = 'agent'
  constructor(code: AgentDomainErrorCode, message: string, details?: AppErrorDetails) {
    super({ code, message, details, isExpected: true })
    this.name = 'AgentDomainError'
  }
}

export function createAgentDomainError(
  code: AgentDomainErrorCode,
  message: string,
  details?: AppErrorDetails
): AgentDomainError {
  return new AgentDomainError(code, message, details)
}
