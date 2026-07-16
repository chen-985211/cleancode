import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentSessionSnapshot,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import { createUnrestorableAgentSessionSnapshot } from '../dto/createUnrestorableAgentSessionSnapshot'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { CodexAgentProcessPort } from '../ports/CodexAgentProcessPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import { CodexThreadId } from '../../domain/value-objects/CodexThreadId'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import { AgentToolApprovalCoordinator } from './AgentToolApprovalCoordinator'
import {
  createAgentSessionCallbacks,
  createAgentConversationScope,
  createAgentRuntimeSessionId,
  registerAgentMcpEndpoint,
  toAgentSessionSnapshot,
  unregisterAgentMcpEndpoint,
  type AttachAgentSessionCommand,
  type ManagedAgentSession
} from './AgentSessionRuntimeState'

export type { AttachAgentSessionCommand } from './AgentSessionRuntimeState'

export class AgentSessionService {
  private readonly sessions = new Map<string, ManagedAgentSession>()
  private readonly pendingPersistence = new Set<Promise<void>>()
  private readonly approvalCoordinator: AgentToolApprovalCoordinator

  constructor(
    private readonly processPort: CodexAgentProcessPort,
    private readonly mcpServerPort: AgentMcpServerPort,
    private readonly executeAgentTool: (
      command: ExecuteAgentToolCommand
    ) => Promise<AgentToolExecutionResult>,
    private readonly sessionRepository: AgentSessionRepository
  ) {
    this.approvalCoordinator = new AgentToolApprovalCoordinator(executeAgentTool, (sessionId) =>
      this.findSessionById(sessionId)
    )
  }

  async attach(command: AttachAgentSessionCommand): Promise<AgentSessionSnapshot> {
    const scope = createAgentConversationScope(command)
    const sessionKey = scope.key
    const existingSession = this.sessions.get(sessionKey)

    if (existingSession && command.restartMode !== 'new' && existingSession.status === 'running') {
      existingSession.callbacks = createAgentSessionCallbacks(command)
      if (command.columns && command.rows && existingSession.status === 'running') {
        this.processPort.resize(existingSession.sessionId, command.columns, command.rows)
      }

      return toAgentSessionSnapshot(existingSession)
    }

    if (existingSession) {
      await this.disposeManagedSession(sessionKey, existingSession)
    }

    await this.disposeOtherScopeForAgentInDirectory(
      command.workspaceDirectory,
      command.agentId,
      sessionKey
    )

    const shouldPersist = command.persistenceMode !== 'ephemeral'

    if (command.restartMode === 'new' && shouldPersist) {
      await this.sessionRepository.delete(scope)
    }

    let persistedSession: AgentSession | null = null
    let workspaceAgent: AgentSession | null = null

    try {
      persistedSession = shouldPersist ? await this.sessionRepository.find(scope) : null
      workspaceAgent =
        persistedSession ??
        (await this.sessionRepository.findAgent(
          scope.toSnapshot().projectId,
          command.workspaceName,
          command.agentId
        ))
    } catch {
      const scopeSnapshot = scope.toSnapshot()
      return createUnrestorableAgentSessionSnapshot({
        agentId: command.agentId,
        gitBranch: scopeSnapshot.gitBranch,
        projectDirectory: command.projectDirectory,
        projectId: scopeSnapshot.projectId,
        sessionId: createAgentRuntimeSessionId(),
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    }

    const session: ManagedAgentSession = {
      agentId: command.agentId,
      callbacks: createAgentSessionCallbacks(command),
      cleancodeMcpEnabled: workspaceAgent?.cleancodeMcpEnabled ?? true,
      codexThreadId: persistedSession?.boundCodexThreadId ?? null,
      columns: command.columns ?? 88,
      gitBranch: scope.toSnapshot().gitBranch,
      isStopping: false,
      processId: null,
      shouldPersist,
      projectDirectory: command.projectDirectory,
      projectId: scope.toSnapshot().projectId,
      rows: command.rows ?? 24,
      scope,
      sessionId: createAgentRuntimeSessionId(),
      status: 'running',
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    }
    this.sessions.set(sessionKey, session)

    await this.registerMcpEndpoint(session)

    try {
      await this.startManagedProcess(session)
    } catch {
      session.status = persistedSession ? 'restore_failed' : 'failed'
      unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    }

    return toAgentSessionSnapshot(session)
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

    if (!session) {
      return
    }

    session.columns = command.columns
    session.rows = command.rows
    this.processPort.resize(command.sessionId, command.columns, command.rows)
  }

  async suspendWorkspaceDirectory(workspaceDirectory: string): Promise<boolean> {
    const sessions = [...this.sessions.values()].filter(
      (candidate) =>
        candidate.workspaceDirectory === workspaceDirectory && candidate.status === 'running'
    )

    if (sessions.length === 0) {
      return false
    }

    for (const session of sessions) {
      session.isStopping = true
      session.status = 'suspended'
    }
    await Promise.all(sessions.map((session) => this.processPort.stop(session.sessionId)))
    await this.waitForPendingPersistence()
    for (const session of sessions) {
      session.isStopping = false
      session.processId = null
    }
    return true
  }

  async resumeWorkspaceDirectory(workspaceDirectory: string): Promise<void> {
    const sessions = [...this.sessions.values()].filter(
      (candidate) =>
        candidate.workspaceDirectory === workspaceDirectory && candidate.status === 'suspended'
    )

    await Promise.all(
      sessions.map(async (session) => {
        session.status = 'running'
        await this.startManagedProcess(session)
      })
    )
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
          agentId: session.agentId,
          graph: firstResult.graph,
          projectDirectory: session.projectDirectory,
          sessionId: session.sessionId,
          workspaceName: session.workspaceName
        })
      }

      return firstResult
    }

    return this.approvalCoordinator.waitForApproval(session, toolCommand, firstResult)
  }

  approveTool(command: { readonly approvalId: string }): Promise<AgentToolApprovalDecisionResult> {
    return this.approvalCoordinator.approve(command.approvalId)
  }

  rejectTool(command: { readonly approvalId: string }): void {
    this.approvalCoordinator.reject(command.approvalId)
  }

  listPendingApprovals(): readonly AgentToolApprovalRequest[] {
    return this.approvalCoordinator.list()
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

  async disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<void> {
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (
        session.agentId === command.agentId &&
        session.projectId === command.projectId &&
        session.workspaceName === command.workspaceName
      ) {
        await this.disposeManagedSession(sessionKey, session)
      }
    }
  }

  async reconfigureAgent(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<AgentSessionSnapshot | null> {
    const session = [...this.sessions.values()].find(
      (candidate) =>
        candidate.agentId === command.agentId &&
        candidate.projectId === command.projectId &&
        candidate.workspaceName === command.workspaceName
    )
    if (!session) {
      return null
    }

    this.cancelSessionApprovals(session.sessionId)
    session.isStopping = true
    await this.processPort.stop(session.sessionId)
    unregisterAgentMcpEndpoint(session, this.mcpServerPort)

    session.cleancodeMcpEnabled = command.cleancodeMcpEnabled
    session.isStopping = false
    session.processId = null
    session.sessionId = createAgentRuntimeSessionId()
    session.status = 'running'
    await this.registerMcpEndpoint(session)

    try {
      await this.startManagedProcess(session)
    } catch {
      session.status = session.codexThreadId ? 'restore_failed' : 'failed'
      unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    }

    return toAgentSessionSnapshot(session)
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

  private persistCodexThread(session: ManagedAgentSession, threadId: string): void {
    if (!session.shouldPersist) {
      return
    }

    const persistence = (async () => {
      const persistedSession =
        (await this.sessionRepository.find(session.scope)) ?? AgentSession.start(session.scope)
      persistedSession.bindCodexThread(session.scope, CodexThreadId.create(threadId))
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
    const processSessionId = session.sessionId
    const handle = await this.processPort.start({
      cleancodeMcp: session.mcpEndpoint
        ? {
            bearerToken: session.mcpEndpoint.bearerToken,
            serverUrl: session.mcpEndpoint.url
          }
        : undefined,
      columns: session.columns,
      onCodexThreadIdentified: (threadId) => {
        if (session.sessionId !== processSessionId) return
        this.persistCodexThread(session, threadId)
      },
      onExit: (event) => {
        if (session.sessionId !== processSessionId) return
        session.processId = null

        if (session.isStopping) {
          return
        }

        session.status = 'exited'
        session.callbacks.onExit({ ...event, agentId: session.agentId })
      },
      onOutput: (event) => session.callbacks.onOutput({ ...event, agentId: session.agentId }),
      resumeThreadId: session.codexThreadId ?? undefined,
      rows: session.rows,
      sessionId: session.sessionId,
      workspaceDirectory: session.workspaceDirectory
    })

    session.processId = handle.processId
  }

  private async registerMcpEndpoint(session: ManagedAgentSession): Promise<void> {
    await registerAgentMcpEndpoint(session, this.mcpServerPort, (toolCommand) =>
      this.executeMcpTool(toolCommand)
    )
  }

  private async disposeOtherScopeForAgentInDirectory(
    workspaceDirectory: string,
    agentId: string,
    activeScopeKey: string
  ): Promise<void> {
    for (const [sessionKey, session] of this.sessions.entries()) {
      if (
        sessionKey !== activeScopeKey &&
        session.agentId === agentId &&
        session.workspaceDirectory === workspaceDirectory
      ) {
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
    unregisterAgentMcpEndpoint(session, this.mcpServerPort)
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

  private cancelSessionApprovals(sessionId: string): void {
    this.approvalCoordinator.cancelSession(sessionId)
  }
}
