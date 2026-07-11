import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentGraphUpdatedEvent,
  AgentPtyExitEvent,
  AgentPtyOutputEvent,
  AgentSessionSnapshot,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import { createUnrestorableAgentSessionSnapshot } from '../dto/createUnrestorableAgentSessionSnapshot'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { CodexAgentProcessPort } from '../ports/CodexAgentProcessPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'
import { CodexThreadId } from '../../domain/value-objects/CodexThreadId'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'

export interface AttachAgentSessionCommand {
  readonly columns?: number
  readonly gitBranch?: string | null
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly onToolApprovalRequested: (event: AgentToolApprovalRequest) => void
  readonly persistenceMode?: 'ephemeral' | 'persistent'
  readonly projectDirectory: string
  readonly projectId?: string
  readonly restartMode?: 'new' | 'retry'
  readonly rows?: number
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export class AgentSessionService {
  private readonly sessions = new Map<string, ManagedAgentSession>()
  private readonly pendingApprovals = new Map<string, PendingToolApproval>()
  private readonly pendingPersistence = new Set<Promise<void>>()

  constructor(
    private readonly processPort: CodexAgentProcessPort,
    private readonly mcpServerPort: AgentMcpServerPort,
    private readonly executeAgentTool: (
      command: ExecuteAgentToolCommand
    ) => Promise<AgentToolExecutionResult>,
    private readonly sessionRepository: AgentSessionRepository
  ) {}

  async attach(command: AttachAgentSessionCommand): Promise<AgentSessionSnapshot> {
    const scope = createConversationScope(command)
    const sessionKey = scope.key
    const existingSession = this.sessions.get(sessionKey)

    if (existingSession && command.restartMode !== 'new' && existingSession.status === 'running') {
      this.updateCallbacks(existingSession, command)
      if (command.columns && command.rows && existingSession.status === 'running') {
        this.processPort.resize(existingSession.sessionId, command.columns, command.rows)
      }

      return toSnapshot(existingSession)
    }

    if (existingSession) {
      await this.disposeManagedSession(sessionKey, existingSession)
    }

    await this.suspendOtherScopeInDirectory(command.workspaceDirectory, sessionKey)

    const shouldPersist = command.persistenceMode !== 'ephemeral'

    if (command.restartMode === 'new' && shouldPersist) {
      await this.sessionRepository.delete(scope)
    }

    let persistedSession: AgentSession | null = null

    try {
      persistedSession = shouldPersist ? await this.sessionRepository.find(scope) : null
    } catch {
      const scopeSnapshot = scope.toSnapshot()
      return createUnrestorableAgentSessionSnapshot({
        gitBranch: scopeSnapshot.gitBranch,
        projectDirectory: command.projectDirectory,
        projectId: scopeSnapshot.projectId,
        sessionId: createAgentSessionId(),
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    }

    const session: ManagedAgentSession = {
      callbacks: createCallbacks(command),
      codexThreadId: persistedSession?.boundCodexThreadId ?? null,
      columns: command.columns ?? 88,
      gitBranch: scope.toSnapshot().gitBranch,
      isStopping: false,
      mcpBearerToken: '',
      mcpServerUrl: '',
      processId: null,
      shouldPersist,
      projectDirectory: command.projectDirectory,
      projectId: scope.toSnapshot().projectId,
      rows: command.rows ?? 24,
      scope,
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
    session.mcpBearerToken = endpoint.bearerToken
    session.mcpServerUrl = endpoint.url

    try {
      await this.startManagedProcess(session)
    } catch {
      session.status = persistedSession ? 'restore_failed' : 'failed'
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
    const session = this.findSessionById(command.sessionId)

    if (session) {
      session.columns = command.columns
      session.rows = command.rows
    }

    this.processPort.resize(command.sessionId, command.columns, command.rows)
  }

  async suspendWorkspaceDirectory(workspaceDirectory: string): Promise<boolean> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.workspaceDirectory === workspaceDirectory && candidate.status === 'running'
    )

    if (!session) {
      return false
    }

    session.isStopping = true
    session.status = 'suspended'
    await this.processPort.stop(session.sessionId)
    await this.waitForPendingPersistence()
    session.isStopping = false
    session.processId = null
    return true
  }

  async resumeWorkspaceDirectory(workspaceDirectory: string): Promise<void> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.workspaceDirectory === workspaceDirectory && candidate.status === 'suspended'
    )

    if (!session) {
      return
    }

    session.status = 'running'
    await this.startManagedProcess(session)
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

  async disposeSession(command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }): Promise<void> {
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (
        session.projectDirectory === command.projectDirectory &&
        session.workspaceName === command.workspaceName
      ) {
        await this.disposeManagedSession(sessionKey, session)
      }
    }
  }

  async disposeProject(projectDirectory: string): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      if (session.projectDirectory === projectDirectory) {
        await this.disposeSession({
          projectDirectory: session.projectDirectory,
          workspaceName: session.workspaceName
        })
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      this.cancelSessionApprovals(session.sessionId)
      session.isStopping = true
    }

    this.sessions.clear()
    await this.processPort.disposeAll()
    await this.waitForPendingPersistence()
    this.mcpServerPort.dispose()
  }

  private updateCallbacks(session: ManagedAgentSession, command: AttachAgentSessionCommand): void {
    session.callbacks = createCallbacks(command)
  }

  private persistCodexThread(session: ManagedAgentSession, threadId: string): void {
    if (!session.shouldPersist) {
      return
    }

    const persistence = (async () => {
      const persistedSession = AgentSession.start(session.scope)
      persistedSession.bindCodexThread(CodexThreadId.create(threadId))
      await this.sessionRepository.save(persistedSession)
      session.codexThreadId = threadId
    })().catch(() => {
      session.status = 'restore_failed'
    })

    this.pendingPersistence.add(persistence)
    void persistence.finally(() => this.pendingPersistence.delete(persistence))
  }

  private async waitForPendingPersistence(): Promise<void> {
    await Promise.all([...this.pendingPersistence])
  }

  private async startManagedProcess(session: ManagedAgentSession): Promise<void> {
    const handle = await this.processPort.start({
      bearerToken: session.mcpBearerToken,
      columns: session.columns,
      mcpServerUrl: session.mcpServerUrl,
      onCodexThreadIdentified: (threadId) => {
        this.persistCodexThread(session, threadId)
      },
      onExit: (event) => {
        session.processId = null

        if (session.isStopping) {
          return
        }

        session.status = 'exited'
        session.callbacks.onExit(event)
      },
      onOutput: (event) => session.callbacks.onOutput(event),
      resumeThreadId: session.codexThreadId ?? undefined,
      rows: session.rows,
      sessionId: session.sessionId,
      workspaceDirectory: session.workspaceDirectory
    })

    session.processId = handle.processId
  }

  private async suspendOtherScopeInDirectory(
    workspaceDirectory: string,
    activeScopeKey: string
  ): Promise<void> {
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (sessionKey !== activeScopeKey && session.workspaceDirectory === workspaceDirectory) {
        await this.disposeManagedSession(sessionKey, session)
      }
    }
  }

  private async disposeManagedSession(
    sessionKey: string,
    session: ManagedAgentSession
  ): Promise<void> {
    this.cancelSessionApprovals(session.sessionId)
    session.isStopping = true
    await this.processPort.stop(session.sessionId)
    this.mcpServerPort.unregisterSession(session.sessionId)
    this.sessions.delete(sessionKey)
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
  codexThreadId: string | null
  columns: number
  readonly gitBranch: string | null
  isStopping: boolean
  mcpBearerToken: string
  mcpServerUrl: string
  processId: number | null
  readonly projectDirectory: string
  readonly projectId: string
  rows: number
  readonly shouldPersist: boolean
  readonly scope: AgentConversationScope
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

function createCanceledToolResult(toolCallId: string, reason: string): AgentToolExecutionResult {
  return {
    output: { reason, type: 'tool_canceled' },
    status: 'canceled',
    toolCallId
  }
}

function createConversationScope(command: AttachAgentSessionCommand): AgentConversationScope {
  return AgentConversationScope.create({
    gitBranch: command.gitBranch ?? null,
    projectId: command.projectId ?? command.projectDirectory,
    workspaceName: command.workspaceName
  })
}

function createAgentSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-session-${Date.now()}-${Math.random()}`
}
