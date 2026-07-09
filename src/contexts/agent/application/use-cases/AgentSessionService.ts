import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import type { CodexAgentProcessPort } from '../ports/CodexAgentProcessPort'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'

export interface AttachAgentSessionCommand {
  readonly columns?: number
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
  readonly projectDirectory: string
  readonly rows?: number
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export class AgentSessionService {
  private readonly sessions = new Map<string, ManagedAgentSession>()
  private readonly pendingApprovals = new Map<string, PendingToolApproval>()

  constructor(
    private readonly processPort: CodexAgentProcessPort,
    private readonly mcpServerPort: AgentMcpServerPort,
    private readonly executeAgentTool: (
      command: ExecuteAgentToolCommand
    ) => Promise<AgentToolExecutionResult>
  ) {}

  async attach(command: AttachAgentSessionCommand): Promise<AgentSessionSnapshot> {
    const sessionKey = createWorkspaceSessionKey(command.projectDirectory, command.workspaceName)
    const existingSession = this.sessions.get(sessionKey)

    if (existingSession) {
      this.updateCallbacks(existingSession, command)
      if (command.columns && command.rows && existingSession.status === 'running') {
        this.processPort.resize(existingSession.sessionId, command.columns, command.rows)
      }

      return toSnapshot(existingSession)
    }

    const session: ManagedAgentSession = {
      callbacks: createCallbacks(command),
      processId: null,
      projectDirectory: command.projectDirectory,
      sessionId: createAgentSessionId(),
      status: 'running',
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    }
    this.sessions.set(sessionKey, session)

    const endpoint = await this.mcpServerPort.registerSession({
      executeTool: (toolCommand) => this.executeMcpTool(toolCommand),
      projectDirectory: command.projectDirectory,
      sessionId: session.sessionId,
      workspaceName: command.workspaceName
    })

    try {
      const handle = await this.processPort.start({
        bearerToken: endpoint.bearerToken,
        columns: command.columns ?? 88,
        mcpServerUrl: endpoint.url,
        onExit: (event) => {
          session.status = 'exited'
          session.callbacks.onExit(event)
        },
        onOutput: (event) => session.callbacks.onOutput(event),
        rows: command.rows ?? 24,
        sessionId: session.sessionId,
        workspaceDirectory: command.workspaceDirectory
      })

      session.processId = handle.processId
    } catch {
      session.status = 'failed'
    }

    return toSnapshot(session)
  }

  write(command: { readonly input: string; readonly sessionId: string }): void {
    this.processPort.write(command.sessionId, command.input)
  }

  resize(command: {
    readonly columns: number
    readonly rows: number
    readonly sessionId: string
  }): void {
    this.processPort.resize(command.sessionId, command.columns, command.rows)
  }

  async executeMcpTool(command: AgentMcpToolCallCommand): Promise<AgentToolExecutionResult> {
    const session = this.requireSessionById(command.sessionId)
    const toolCommand = {
      input: command.input,
      projectDirectory: session.projectDirectory,
      sessionId: session.sessionId,
      toolName: command.toolName,
      workspaceName: session.workspaceName
    } as ExecuteAgentToolCommand
    const firstResult = await this.executeAgentTool(toolCommand)

    if (firstResult.status !== 'awaiting_approval') {
      if (firstResult.status === 'completed') {
        session.callbacks.onGraphUpdated({
          graph: firstResult.graph,
          projectDirectory: session.projectDirectory,
          sessionId: session.sessionId,
          workspaceName: session.workspaceName
        })
      }

      return firstResult
    }

    return this.waitForApproval(session, toolCommand, firstResult)
  }

  approveTool(command: { readonly approvalId: string }): void {
    this.resolvePendingApproval(command.approvalId, 'approved')
  }

  rejectTool(command: { readonly approvalId: string }): void {
    this.resolvePendingApproval(command.approvalId, 'rejected')
  }

  listPendingApprovals(): readonly AgentToolApprovalRequest[] {
    return [...this.pendingApprovals.values()].map((approval) => approval.request)
  }

  disposeSession(command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }): void {
    const sessionKey = createWorkspaceSessionKey(command.projectDirectory, command.workspaceName)
    const session = this.sessions.get(sessionKey)

    if (!session) {
      return
    }

    this.cancelSessionApprovals(session.sessionId)
    this.processPort.stop(session.sessionId)
    this.mcpServerPort.unregisterSession(session.sessionId)
    this.sessions.delete(sessionKey)
  }

  disposeProject(projectDirectory: string): void {
    for (const session of [...this.sessions.values()]) {
      if (session.projectDirectory === projectDirectory) {
        this.disposeSession({
          projectDirectory: session.projectDirectory,
          workspaceName: session.workspaceName
        })
      }
    }
  }

  disposeAll(): void {
    for (const session of [...this.sessions.values()]) {
      this.cancelSessionApprovals(session.sessionId)
    }

    this.sessions.clear()
    this.processPort.disposeAll()
    this.mcpServerPort.dispose()
  }

  private updateCallbacks(session: ManagedAgentSession, command: AttachAgentSessionCommand): void {
    session.callbacks = createCallbacks(command)
  }

  private requireSessionById(sessionId: string): ManagedAgentSession {
    const session = this.findSessionById(sessionId)

    if (!session) {
      throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent session was not found.')
    }

    return session
  }

  private findSessionById(sessionId: string): ManagedAgentSession | undefined {
    return [...this.sessions.values()].find((candidate) => candidate.sessionId === sessionId)
  }

  private waitForApproval(
    session: ManagedAgentSession,
    command: ExecuteAgentToolCommand,
    result: Extract<AgentToolExecutionResult, { readonly status: 'awaiting_approval' }>
  ): Promise<AgentToolExecutionResult> {
    const request: AgentToolApprovalRequest = {
      approvalId: result.toolCallId,
      projectDirectory: session.projectDirectory,
      sessionId: session.sessionId,
      summary: result.approval.summary,
      toolName: result.approval.toolName,
      workspaceName: session.workspaceName
    }

    session.callbacks.onToolApprovalRequested(request)

    return new Promise((resolve) => {
      this.pendingApprovals.set(request.approvalId, {
        command,
        request,
        resolve,
        sessionId: session.sessionId
      })
    })
  }

  private resolvePendingApproval(approvalId: string, decision: 'approved' | 'rejected'): void {
    const pendingApproval = this.pendingApprovals.get(approvalId)

    if (!pendingApproval) {
      return
    }

    this.pendingApprovals.delete(approvalId)

    if (decision === 'rejected') {
      pendingApproval.resolve(createCanceledToolResult(approvalId, 'User rejected the tool call.'))
      return
    }

    void this.executeAgentTool({ ...pendingApproval.command, approved: true }).then((result) => {
      const session = this.findSessionById(pendingApproval.sessionId)

      if (!session) {
        pendingApproval.resolve(createCanceledToolResult(approvalId, 'Agent session was disposed.'))
        return
      }

      if (result.status === 'completed') {
        session.callbacks.onGraphUpdated({
          graph: result.graph,
          projectDirectory: session.projectDirectory,
          sessionId: session.sessionId,
          workspaceName: session.workspaceName
        })
      }

      pendingApproval.resolve(result)
    })
  }

  private cancelSessionApprovals(sessionId: string): void {
    for (const [approvalId, pendingApproval] of this.pendingApprovals.entries()) {
      if (pendingApproval.sessionId !== sessionId) {
        continue
      }

      this.pendingApprovals.delete(approvalId)
      pendingApproval.resolve(createCanceledToolResult(approvalId, 'Agent session was disposed.'))
    }
  }
}

interface ManagedAgentSession {
  callbacks: AgentSessionCallbacks
  processId: number | null
  readonly projectDirectory: string
  readonly sessionId: string
  status: AgentSessionSnapshot['status']
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

interface AgentSessionCallbacks {
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
}

interface PendingToolApproval {
  readonly command: ExecuteAgentToolCommand
  readonly request: AgentToolApprovalRequest
  readonly resolve: (result: AgentToolExecutionResult) => void
  readonly sessionId: string
}

function createCallbacks(command: AttachAgentSessionCommand): AgentSessionCallbacks {
  return {
    onExit: command.onExit,
    onGraphUpdated: command.onGraphUpdated,
    onOutput: command.onOutput,
    onToolApprovalRequested: command.onToolApprovalRequested
  }
}

function toSnapshot(session: ManagedAgentSession): AgentSessionSnapshot {
  return {
    processId: session.processId,
    projectDirectory: session.projectDirectory,
    sessionId: session.sessionId,
    status: session.status,
    workspaceDirectory: session.workspaceDirectory,
    workspaceName: session.workspaceName
  }
}

function createCanceledToolResult(toolCallId: string, reason: string): AgentToolExecutionResult {
  return {
    output: { reason, type: 'tool_canceled' },
    status: 'canceled',
    toolCallId
  }
}

function createWorkspaceSessionKey(projectDirectory: string, workspaceName: string): string {
  return `${projectDirectory}\0${workspaceName}`
}

function createAgentSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}-${Math.random()}`
}
