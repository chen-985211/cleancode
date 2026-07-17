import type {
  AgentSessionSnapshot,
  AgentToolApprovalDecisionResult,
  AgentToolApprovalRequest
} from '../dto/AgentSessionProtocol'
import { createUnrestorableAgentSessionSnapshot } from '../dto/createUnrestorableAgentSessionSnapshot'
import type { AgentMcpServerPort, AgentMcpToolCallCommand } from '../ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import {
  allowAgentRuntimeScope,
  type AgentRuntimeScopeValidationPort
} from '../ports/AgentRuntimeScopeValidationPort'
import type { CodexAgentProcessPort } from '../ports/CodexAgentProcessPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import { CodexThreadId } from '../../domain/value-objects/CodexThreadId'
import type { AgentToolExecutionResult, ExecuteAgentToolCommand } from './ExecuteAgentToolUseCase'
import { AgentToolApprovalCoordinator } from './AgentToolApprovalCoordinator'
import {
  AgentSessionRuntimeCoordinator,
  createAgentSessionRuntimeOwner,
  isOwnedAgentSession,
  type AgentRuntimeAttachmentLease,
  type AgentRuntimeSuspensionLease,
  type AgentSessionRuntimeOwner
} from './AgentSessionRuntimeCoordinator'
import {
  createAgentSessionCallbacks,
  createAgentConversationScope,
  createAgentRuntimeSessionId,
  findOwnedManagedAgentSession,
  recordAgentSessionStartFailure,
  recordAgentSessionStopFailure,
  registerAgentMcpEndpoint,
  requireManagedAgentSession,
  toAgentSessionSnapshot,
  unregisterAgentMcpEndpoint,
  validateAgentRuntimeScope,
  validateManagedAgentRuntimeScope,
  type AttachAgentSessionCommand,
  type ManagedAgentSession
} from './AgentSessionRuntimeState'

export class AgentSessionService {
  private readonly sessions = new Map<string, ManagedAgentSession>()
  private readonly pendingPersistence = new Set<Promise<void>>()
  private readonly approvalCoordinator: AgentToolApprovalCoordinator
  private readonly runtimeCoordinator = new AgentSessionRuntimeCoordinator()

  constructor(
    private readonly processPort: CodexAgentProcessPort,
    private readonly mcpServerPort: AgentMcpServerPort,
    private readonly executeAgentTool: (
      command: ExecuteAgentToolCommand
    ) => Promise<AgentToolExecutionResult>,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly scopeValidation: AgentRuntimeScopeValidationPort = allowAgentRuntimeScope
  ) {
    this.approvalCoordinator = new AgentToolApprovalCoordinator(executeAgentTool, (sessionId) =>
      this.findSessionById(sessionId)
    )
  }

  async attach(command: AttachAgentSessionCommand): Promise<AgentSessionSnapshot> {
    const owner = createAgentSessionRuntimeOwner({
      ...command,
      projectId: command.projectId ?? command.projectDirectory
    })
    return this.runtimeCoordinator.runAttach(owner, () => this.attachUnserialized(command))
  }

  private async attachUnserialized(
    command: AttachAgentSessionCommand
  ): Promise<AgentSessionSnapshot> {
    const scope = createAgentConversationScope(command)
    const scopeSnapshot = await validateAgentRuntimeScope(command, scope, this.scopeValidation)
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
      return createUnrestorableAgentSessionSnapshot({
        agentId: command.agentId,
        gitBranch: scopeSnapshot.gitBranch,
        projectDirectory: command.projectDirectory,
        projectId: scopeSnapshot.projectId,
        sessionId: createAgentRuntimeSessionId(),
        terminalSourceTheme: command.terminalSourceTheme,
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
      terminalSourceTheme: command.terminalSourceTheme,
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

  async suspendWorkspaceDirectory(
    workspaceDirectory: string
  ): Promise<AgentRuntimeSuspensionLease> {
    const ownsDirectory = (owner: AgentSessionRuntimeOwner): boolean =>
      owner.workspaceDirectory === workspaceDirectory
    const attachmentLease = await this.runtimeCoordinator.acquireDirectoryLease(
      workspaceDirectory,
      ownsDirectory
    )

    try {
      const results = await this.runtimeCoordinator.runForOwners(ownsDirectory, (owner) =>
        this.suspendRuntimeOwner(owner)
      )
      return {
        ...attachmentLease,
        resume: () => this.resumeWorkspaceDirectory(workspaceDirectory),
        wasSuspended: results.some(Boolean)
      }
    } catch (error) {
      attachmentLease.release()
      throw error
    }
  }

  async resumeWorkspaceDirectory(workspaceDirectory: string): Promise<void> {
    await this.runtimeCoordinator.runForOwners(
      (owner) => owner.workspaceDirectory === workspaceDirectory,
      (owner) => this.resumeRuntimeOwner(owner)
    )
  }

  isWorkspaceQuarantined(projectDirectory: string, workspaceName: string): boolean {
    return this.runtimeCoordinator.isWorkspaceQuarantined(projectDirectory, workspaceName)
  }

  resolveProjectQuarantines(projectDirectory: string): void {
    this.runtimeCoordinator.resolveProjectQuarantines(projectDirectory)
  }

  async executeMcpTool(command: AgentMcpToolCallCommand): Promise<AgentToolExecutionResult> {
    const session = requireManagedAgentSession(this.sessions.values(), command.sessionId)
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
  }): Promise<AgentRuntimeAttachmentLease> {
    const matches = (owner: AgentSessionRuntimeOwner): boolean =>
      owner.projectDirectory === command.projectDirectory &&
      owner.workspaceName === command.workspaceName
    return this.runtimeCoordinator.runWithWorkspaceLease(
      command.projectDirectory,
      command.workspaceName,
      matches,
      (owner) => this.disposeRuntimeOwner(owner)
    )
  }

  async disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<AgentRuntimeAttachmentLease> {
    const matches = (owner: AgentSessionRuntimeOwner): boolean =>
      owner.agentId === command.agentId &&
      owner.projectId === command.projectId &&
      owner.workspaceName === command.workspaceName
    return this.runtimeCoordinator.runWithAgentLease(
      command.projectId,
      command.workspaceName,
      command.agentId,
      matches,
      (owner) => this.disposeRuntimeOwner(owner)
    )
  }

  async reconfigureAgent(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<AgentSessionSnapshot | null> {
    const results = await this.runtimeCoordinator.runStartForOwners(
      (owner) =>
        owner.agentId === command.agentId &&
        owner.projectId === command.projectId &&
        owner.workspaceName === command.workspaceName,
      (owner) => this.reconfigureRuntimeOwner(owner, command.cleancodeMcpEnabled)
    )
    return results.find((result) => result !== null) ?? null
  }

  async disposeProject(projectDirectory: string): Promise<AgentRuntimeAttachmentLease> {
    const matches = (owner: AgentSessionRuntimeOwner): boolean =>
      owner.projectDirectory === projectDirectory
    return this.runtimeCoordinator.runWithProjectLease(projectDirectory, matches, (owner) =>
      this.disposeRuntimeOwner(owner)
    )
  }

  async disposeAll(): Promise<void> {
    this.runtimeCoordinator.stop()
    await this.runtimeCoordinator.waitForIdle()
    for (const session of [...this.sessions.values()]) {
      this.cancelSessionApprovals(session.sessionId)
      session.isStopping = true
    }

    this.sessions.clear()
    this.runtimeCoordinator.clear()
    await this.processPort.disposeAll()
    await this.waitForPendingPersistence()
    this.mcpServerPort.dispose()
  }

  private async suspendRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<boolean> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.status !== 'running') return false

    session.isStopping = true
    session.status = 'suspended'
    try {
      await this.processPort.stop(session.sessionId)
      await this.waitForPendingPersistence()
      session.isStopping = false
      session.processId = null
      return true
    } catch (error) {
      recordAgentSessionStopFailure(session, this.mcpServerPort)
      throw error
    }
  }

  private async resumeRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<void> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.status !== 'suspended') return

    session.status = 'running'
    try {
      await this.startManagedProcess(session)
    } catch (error) {
      recordAgentSessionStartFailure(session, this.mcpServerPort)
      throw error
    }
  }

  private async disposeRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<void> {
    const entry = [...this.sessions.entries()].find(([, session]) =>
      isOwnedAgentSession(owner, session)
    )
    if (entry) await this.disposeManagedSession(...entry)
  }

  private async reconfigureRuntimeOwner(
    owner: AgentSessionRuntimeOwner,
    cleancodeMcpEnabled: boolean
  ): Promise<AgentSessionSnapshot | null> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.status !== 'running') return null
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    this.cancelSessionApprovals(session.sessionId)
    session.isStopping = true
    await this.processPort.stop(session.sessionId)
    unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    session.cleancodeMcpEnabled = cleancodeMcpEnabled
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
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
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

  private findSessionById(sessionId: string): ManagedAgentSession | undefined {
    return [...this.sessions.values()].find((candidate) => candidate.sessionId === sessionId)
  }

  private cancelSessionApprovals(sessionId: string): void {
    this.approvalCoordinator.cancelSession(sessionId)
  }
}
