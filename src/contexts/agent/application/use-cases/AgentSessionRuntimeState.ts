import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

export interface AttachAgentSessionCommand extends AgentSessionCallbacks {
  readonly agentId: string
  readonly columns?: number
  readonly gitBranch?: string | null
  readonly persistenceMode?: 'ephemeral' | 'persistent'
  readonly projectDirectory: string
  readonly projectId?: string
  readonly restartMode?: 'new' | 'retry'
  readonly rows?: number
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export interface AgentSessionCallbacks {
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
}

export interface ManagedAgentSession {
  readonly agentId: string
  callbacks: AgentSessionCallbacks
  cleancodeMcpEnabled: boolean
  codexThreadId: string | null
  columns: number
  readonly gitBranch: string | null
  isStopping: boolean
  mcpEndpoint?: { readonly bearerToken: string; readonly url: string }
  processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  rows: number
  readonly shouldPersist: boolean
  readonly scope: AgentConversationScope
  sessionId: string
  status: AgentSessionSnapshot['status']
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export interface PendingToolApproval {
  readonly command: ExecuteAgentToolCommand
  readonly request: AgentToolApprovalRequest
  readonly resolve: (result: AgentToolExecutionResult) => void
  readonly sessionId: string
}

export function createAgentSessionCallbacks(command: AgentSessionCallbacks): AgentSessionCallbacks {
  return {
    onExit: command.onExit,
    onGraphUpdated: command.onGraphUpdated,
    onOutput: command.onOutput,
    onToolApprovalRequested: command.onToolApprovalRequested
  }
}

export async function registerAgentMcpEndpoint(
  session: ManagedAgentSession,
  mcpServerPort: AgentMcpServerPort,
  executeTool: (command: AgentMcpToolCallCommand) => Promise<AgentToolExecutionResult>
): Promise<void> {
  if (!session.cleancodeMcpEnabled) {
    return
  }

  session.mcpEndpoint = await mcpServerPort.registerSession({
    executeTool,
    projectDirectory: session.projectDirectory,
    sessionId: session.sessionId,
    workspaceName: session.workspaceName
  })
}

export function unregisterAgentMcpEndpoint(
  session: ManagedAgentSession,
  mcpServerPort: AgentMcpServerPort
): void {
  if (!session.mcpEndpoint) {
    return
  }

  mcpServerPort.unregisterSession(session.sessionId)
  session.mcpEndpoint = undefined
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
