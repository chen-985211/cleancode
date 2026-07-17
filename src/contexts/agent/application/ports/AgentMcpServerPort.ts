import type { AgentToolName } from '../../domain/value-objects/AgentToolName'
import type { AgentToolExecutionResult } from '../use-cases/ExecuteAgentToolUseCase'

export interface AgentMcpToolCallCommand {
  readonly input: Record<string, unknown>
  readonly sessionId: string
  readonly toolCallId: string
  readonly toolName: AgentToolName
}

export interface RegisteredAgentMcpSession {
  readonly executeTool: (command: AgentMcpToolCallCommand) => Promise<AgentToolExecutionResult>
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceName: string
}

export interface AgentMcpEndpoint {
  readonly bearerToken: string
  readonly url: string
}

export interface AgentMcpServerPort {
  registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpEndpoint>
  unregisterSession(sessionId: string): void
  dispose(): void
}
