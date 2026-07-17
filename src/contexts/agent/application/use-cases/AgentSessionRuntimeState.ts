import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentTerminalSourceTheme,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentToolExecutionResult } from './ExecuteAgentToolUseCase'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import type {
  AgentRuntimeScopeValidationCommand,
  AgentRuntimeScopeValidationPort
} from '../ports/AgentRuntimeScopeValidationPort'
import {
  AgentConversationScope,
  type AgentConversationScopeSnapshot
} from '../../domain/value-objects/AgentConversationScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  isOwnedAgentSession,
  type AgentSessionRuntimeOwner
} from './AgentSessionRuntimeCoordinator'

export interface AttachAgentSessionCommand extends AgentSessionCallbacks {
  readonly agentId: string
  readonly columns?: number
  readonly gitBranch?: string | null
  readonly persistenceMode?: 'ephemeral' | 'persistent'
  readonly projectDirectory: string
  readonly projectId?: string
  readonly restartMode?: 'new' | 'retry'
  readonly rows?: number
  readonly terminalSourceTheme: AgentTerminalSourceTheme
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
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export function createAgentSessionCallbacks(command: AgentSessionCallbacks): AgentSessionCallbacks {
  return {
    onExit: command.onExit,
    onGraphUpdated: command.onGraphUpdated,
    onOutput: command.onOutput,
    onToolApprovalRequested: command.onToolApprovalRequested
  }
}

export async function validateAgentRuntimeScope(
  command: AttachAgentSessionCommand,
  scope: AgentConversationScope,
  validation: AgentRuntimeScopeValidationPort
): Promise<AgentConversationScopeSnapshot> {
  const snapshot = scope.toSnapshot()
  await assertAgentRuntimeScope(
    {
      agentId: command.agentId,
      gitBranch: snapshot.gitBranch,
      projectDirectory: command.projectDirectory,
      projectId: snapshot.projectId,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    },
    validation
  )
  return snapshot
}

export function validateManagedAgentRuntimeScope(
  session: ManagedAgentSession,
  validation: AgentRuntimeScopeValidationPort
): Promise<void> {
  return assertAgentRuntimeScope(
    {
      agentId: session.agentId,
      gitBranch: session.gitBranch,
      projectDirectory: session.projectDirectory,
      projectId: session.projectId,
      workspaceDirectory: session.workspaceDirectory,
      workspaceName: session.workspaceName
    },
    validation
  )
}

async function assertAgentRuntimeScope(
  command: AgentRuntimeScopeValidationCommand,
  validation: AgentRuntimeScopeValidationPort
): Promise<void> {
  const isValid = await validation.isValid(command)
  if (!isValid) {
    throw createExpectedAppError(
      'AGENT_SESSION_NOT_FOUND',
      'Agent runtime scope is no longer active.'
    )
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

export function recordAgentSessionStartFailure(
  session: ManagedAgentSession,
  mcpServerPort: AgentMcpServerPort
): void {
  session.status = session.codexThreadId ? 'restore_failed' : 'failed'
  unregisterAgentMcpEndpoint(session, mcpServerPort)
}

export function recordAgentSessionStopFailure(
  session: ManagedAgentSession,
  mcpServerPort: AgentMcpServerPort
): void {
  session.isStopping = false
  session.status = session.processId === null ? 'failed' : 'running'
  if (session.status === 'failed') unregisterAgentMcpEndpoint(session, mcpServerPort)
}

export function findOwnedManagedAgentSession(
  sessions: Iterable<ManagedAgentSession>,
  owner: AgentSessionRuntimeOwner
): ManagedAgentSession | undefined {
  return [...sessions].find((session) => isOwnedAgentSession(owner, session))
}

export function requireManagedAgentSession(
  sessions: Iterable<ManagedAgentSession>,
  sessionId: string
): ManagedAgentSession {
  const session = [...sessions].find((candidate) => candidate.sessionId === sessionId)
  if (!session) {
    throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent session was not found.')
  }
  return session
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
  readonly terminalSourceTheme: AgentTerminalSourceTheme
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
    terminalSourceTheme: session.terminalSourceTheme,
    workspaceDirectory: session.workspaceDirectory,
    workspaceName: session.workspaceName
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
