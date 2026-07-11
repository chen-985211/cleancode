import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentToolExecutionResult } from './ExecuteAgentToolUseCase'
import { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

export interface AgentSessionCallbacks {
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
}

export function createAgentSessionCallbacks(command: AgentSessionCallbacks): AgentSessionCallbacks {
  return {
    onExit: command.onExit,
    onGraphUpdated: command.onGraphUpdated,
    onOutput: command.onOutput,
    onToolApprovalRequested: command.onToolApprovalRequested
  }
}

export function toAgentSessionSnapshot(session: {
  readonly agentId: string
  readonly codexThreadId: string | null
  readonly gitBranch: string | null
  readonly processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly status: AgentSessionSnapshot['status']
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: session.agentId,
    codexThreadId: session.codexThreadId,
    gitBranch: session.gitBranch,
    processId: session.processId,
    projectDirectory: session.projectDirectory,
    projectId: session.projectId,
    sessionId: session.sessionId,
    status: session.status,
    workspaceDirectory: session.workspaceDirectory,
    workspaceName: session.workspaceName
  }
}

export function createCanceledAgentToolResult(
  toolCallId: string,
  reason: string
): AgentToolExecutionResult {
  return {
    output: { reason, type: 'tool_canceled' },
    status: 'canceled',
    toolCallId
  }
}

export function createAgentConversationScope(command: {
  readonly agentId: string
  readonly gitBranch?: string | null
  readonly projectDirectory: string
  readonly projectId?: string
  readonly workspaceName: string
}): AgentConversationScope {
  return AgentConversationScope.create({
    agentId: command.agentId,
    gitBranch: command.gitBranch ?? null,
    projectId: command.projectId ?? command.projectDirectory,
    workspaceName: command.workspaceName
  })
}

export function createAgentRuntimeSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}-${Math.random()}`
}
