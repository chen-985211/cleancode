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
import type { AgentTerminalRuntimePort } from '../ports/AgentTerminalRuntimePort'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../domain/value-objects/ProviderSessionRef'
import type { AgentToolExecutionResult } from './ExecuteAgentToolUseCase'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  AgentToolApprovalCoordinator,
  type AgentToolExecutionOperations
} from './AgentToolApprovalCoordinator'
import { AgentToolInvocationCoordinator } from './AgentToolInvocationCoordinator'
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
  private readonly toolInvocations: AgentToolInvocationCoordinator
  private readonly runtimeCoordinator = new AgentSessionRuntimeCoordinator()

  constructor(
    private readonly terminalRuntime: AgentTerminalRuntimePort,
    private readonly mcpServerPort: AgentMcpServerPort,
    toolExecution: AgentToolExecutionOperations,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly scopeValidation: AgentRuntimeScopeValidationPort = allowAgentRuntimeScope
  ) {
    this.toolInvocations = new AgentToolInvocationCoordinator(toolExecution)
    this.approvalCoordinator = new AgentToolApprovalCoordinator(this.toolInvocations, (sessionId) =>
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
    if (
      existingSession &&
      existingSession.isTerminalRunning &&
      (command.restartMode === undefined || existingSession.status === 'running')
    ) {
      existingSession.callbacks = createAgentSessionCallbacks(command)
      this.approvalCoordinator.replayWaiting(existingSession)
      if (command.columns && command.rows) {
        this.terminalRuntime.resize(existingSession.sessionId, command.columns, command.rows)
      }
      return toAgentSessionSnapshot(existingSession)
    }
    if (existingSession?.isTerminalRunning) {
      existingSession.callbacks = createAgentSessionCallbacks(command)
      if (command.restartMode === 'new' && existingSession.shouldPersist) {
        await this.waitForPendingPersistence()
        await this.sessionRepository.delete(scope)
        existingSession.providerSessionRef = null
      }
      existingSession.isStopping = false
      existingSession.status = 'running'
      this.toolInvocations.reopenSession(existingSession.sessionId)
      try {
        await this.registerMcpEndpoint(existingSession)
        await this.launchManagedProvider(existingSession)
      } catch {
        existingSession.status = existingSession.providerSessionRef ? 'restore_failed' : 'failed'
        this.beginSessionToolClosing(existingSession)
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
        providerId: command.providerId,
        workspaceDirectory: command.workspaceDirectory,
        workspaceName: command.workspaceName
      })
    }
    if (workspaceAgent && command.providerId && workspaceAgent.providerId !== command.providerId) {
      throw createExpectedAppError(
        'AGENT_PROVIDER_MISMATCH',
        'The Agent Provider cannot be changed after the Agent is created.',
        {
          agentId: command.agentId,
          expectedProviderId: workspaceAgent.providerId,
          providerId: command.providerId
        }
      )
    }
    const session: ManagedAgentSession = {
      activity: 'unavailable',
      agentId: command.agentId,
      callbacks: createAgentSessionCallbacks(command),
      cleancodeMcpEnabled: workspaceAgent?.cleancodeMcpEnabled ?? true,
      columns: command.columns ?? 88,
      gitBranch: scope.toSnapshot().gitBranch,
      isTerminalRunning: false,
      isStopping: false,
      launchArtifacts: [],
      processId: null,
      shouldPersist,
      projectDirectory: command.projectDirectory,
      projectId: scope.toSnapshot().projectId,
      providerId: workspaceAgent?.providerId ?? command.providerId ?? 'codex',
      providerLaunchGeneration: 0,
      providerSessionRef: persistedSession?.boundProviderSessionRef?.toSnapshot() ?? null,
      rows: command.rows ?? 24,
      scope,
      sessionId: createAgentRuntimeSessionId(),
      status: 'running',
      terminalViewIdentity: null,
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    }
    this.sessions.set(sessionKey, session)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch {
      session.status = persistedSession ? 'restore_failed' : 'failed'
      this.toolInvocations.beginSessionClosing(session.sessionId)
      unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    }

    return toAgentSessionSnapshot(session)
  }

  write(command: { readonly input: string; readonly sessionId: string }): void {
    this.terminalRuntime.write(command.sessionId, command.input)
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
    this.terminalRuntime.resize(command.sessionId, command.columns, command.rows)
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
    return this.toolInvocations.runSessionToolCall(session.sessionId, () =>
      this.approvalCoordinator.execute(session, command)
    )
  }

  approveTool(command: { readonly approvalId: string }): Promise<AgentToolApprovalDecisionResult> {
    return this.approvalCoordinator.approve(command.approvalId)
  }

  rejectTool(command: { readonly approvalId: string }): Promise<void> {
    return this.approvalCoordinator.reject(command.approvalId)
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
    const sessions = [...this.sessions.values()]
    for (const session of sessions) this.beginSessionToolClosing(session)
    await Promise.all(sessions.map((session) => this.settleSessionToolCalls(session)))
    this.sessions.clear()
    this.runtimeCoordinator.clear()
    await this.terminalRuntime.disposeAll()
    await this.waitForPendingPersistence()
    this.mcpServerPort.dispose()
    for (const session of sessions) this.toolInvocations.forgetSession(session.sessionId)
  }

  private async suspendRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<boolean> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.status !== 'running') return false
    session.isStopping = true
    session.status = 'suspended'
    this.toolInvocations.beginSessionClosing(session.sessionId)
    try {
      await this.settleSessionToolCalls(session)
      await this.terminalRuntime.stop(session.sessionId)
      await this.disposeLaunchArtifacts(session)
      await this.waitForPendingPersistence()
      unregisterAgentMcpEndpoint(session, this.mcpServerPort)
      session.isStopping = false
      session.isTerminalRunning = false
      session.processId = null
      session.terminalViewIdentity = null
      return true
    } catch (error) {
      this.toolInvocations.reopenSession(session.sessionId)
      recordAgentSessionStopFailure(session, this.mcpServerPort)
      throw error
    }
  }

  private async resumeRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<void> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.status !== 'suspended') return

    session.status = 'running'
    session.isStopping = false
    this.toolInvocations.reopenSession(session.sessionId)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch (error) {
      this.toolInvocations.beginSessionClosing(session.sessionId)
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
    const replacedSessionId = session.sessionId
    session.isStopping = true
    this.toolInvocations.beginSessionClosing(replacedSessionId)
    try {
      await this.settleSessionToolCalls(session)
      await this.terminalRuntime.stop(replacedSessionId)
      await this.disposeLaunchArtifacts(session)
    } catch (error) {
      this.toolInvocations.reopenSession(replacedSessionId)
      recordAgentSessionStopFailure(session, this.mcpServerPort)
      throw error
    }
    unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    session.cleancodeMcpEnabled = cleancodeMcpEnabled
    session.isStopping = false
    session.isTerminalRunning = false
    session.processId = null
    session.terminalViewIdentity = null
    session.sessionId = createAgentRuntimeSessionId()
    session.status = 'running'
    this.toolInvocations.forgetSession(replacedSessionId)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch {
      session.status = session.providerSessionRef ? 'restore_failed' : 'failed'
      this.toolInvocations.beginSessionClosing(session.sessionId)
      unregisterAgentMcpEndpoint(session, this.mcpServerPort)
    }

    return toAgentSessionSnapshot(session)
  }

  private persistProviderSession(
    session: ManagedAgentSession,
    sessionRefSnapshot: ProviderSessionRefSnapshot,
    providerLaunchGeneration: number
  ): void {
    if (!session.shouldPersist) {
      return
    }

    const persistence = (async () => {
      if (session.providerLaunchGeneration !== providerLaunchGeneration || session.isStopping)
        return
      const persistedSession =
        (await this.sessionRepository.find(session.scope)) ??
        AgentSession.start(session.scope, session.providerId)
      if (session.providerLaunchGeneration !== providerLaunchGeneration || session.isStopping)
        return
      const sessionRef = ProviderSessionRef.create(sessionRefSnapshot)
      persistedSession.bindProviderSession(session.scope, sessionRef)
      await this.sessionRepository.save(persistedSession)
      if (session.providerLaunchGeneration === providerLaunchGeneration) {
        session.providerSessionRef = sessionRef.toSnapshot()
      }
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
    let handle
    try {
      handle = await this.terminalRuntime.open({
        agentId: session.agentId,
        columns: session.columns,
        gitBranch: session.gitBranch,
        onTerminalExit: (exitCode) => {
          if (session.sessionId !== processSessionId) return
          session.processId = null
          session.isTerminalRunning = false
          session.terminalViewIdentity = null
          this.updateActivity(session, processSessionId, 'unavailable')
          void this.disposeLaunchArtifacts(session)
          if (session.isStopping || session.status === 'exited') return
          session.status = 'exited'
          this.beginSessionToolClosing(session)
          void this.settleSessionToolCalls(session)
          session.callbacks.onExit({
            agentId: session.agentId,
            exitCode,
            sessionId: processSessionId
          })
        },
        projectDirectory: session.projectDirectory,
        projectId: session.projectId,
        rows: session.rows,
        sessionId: processSessionId,
        terminalSourceTheme: session.terminalSourceTheme,
        workspaceDirectory: session.workspaceDirectory,
        workspaceName: session.workspaceName
      })
      session.isTerminalRunning = true
      session.processId = handle.processId
      session.terminalViewIdentity = handle.viewIdentity ?? null
      await this.launchManagedProvider(session)
    } catch (error) {
      await this.disposeLaunchArtifacts(session)
      if (session.isTerminalRunning) await this.terminalRuntime.stop(processSessionId)
      session.isTerminalRunning = false
      session.processId = null
      session.terminalViewIdentity = null
      throw error
    }
  }

  private async launchManagedProvider(session: ManagedAgentSession): Promise<void> {
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    const providerLaunchGeneration = ++session.providerLaunchGeneration
    await this.disposeLaunchArtifacts(session)
    await this.waitForPendingPersistence()
    const processSessionId = session.sessionId
    this.updateActivity(session, processSessionId, 'unavailable')
    const provider = this.providers.require(session.providerId)
    const plan = await provider.launcher.createLaunchPlan({
      cleancodeMcp: session.mcpEndpoint
        ? {
            bearerToken: session.mcpEndpoint.bearerToken,
            serverUrl: session.mcpEndpoint.url
          }
        : undefined,
      onProviderSessionIdentified: (sessionRef) => {
        if (
          session.sessionId !== processSessionId ||
          session.providerLaunchGeneration !== providerLaunchGeneration ||
          session.isStopping
        )
          return
        this.persistProviderSession(session, sessionRef, providerLaunchGeneration)
      },
      onActivityChanged: (activity) => {
        if (
          session.sessionId !== processSessionId ||
          session.providerLaunchGeneration !== providerLaunchGeneration ||
          session.isStopping
        )
          return
        this.updateActivity(session, processSessionId, activity)
      },
      providerSessionRef: session.providerSessionRef ?? undefined,
      workspaceDirectory: session.workspaceDirectory
    })
    session.launchArtifacts = plan.temporaryArtifacts
    try {
      this.terminalRuntime.launch({
        onExit: (event) => {
          if (
            session.sessionId !== processSessionId ||
            session.providerLaunchGeneration !== providerLaunchGeneration
          )
            return
          void this.disposeLaunchArtifacts(session)
          if (session.isStopping) return
          this.updateActivity(session, processSessionId, 'unavailable')
          session.status = 'exited'
          this.beginSessionToolClosing(session)
          void this.settleSessionToolCalls(session)
          session.callbacks.onExit({
            agentId: session.agentId,
            exitCode: event.exitCode,
            sessionId: processSessionId
          })
        },
        onStarted: () => {
          if (session.sessionId === processSessionId) session.status = 'running'
        },
        plan,
        sessionId: processSessionId
      })
    } catch (error) {
      await this.disposeLaunchArtifacts(session)
      throw error
    }
  }

  private async registerMcpEndpoint(session: ManagedAgentSession): Promise<void> {
    if (
      !session.cleancodeMcpEnabled ||
      !this.providers.require(session.providerId).descriptor.capabilities.cleancodeMcp
    ) {
      this.toolInvocations.beginSessionClosing(session.sessionId)
      return
    }
    this.toolInvocations.reopenSession(session.sessionId)
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
    this.beginSessionToolClosing(session)
    await this.settleSessionToolCalls(session)
    await this.terminalRuntime.stop(session.sessionId)
    await this.disposeLaunchArtifacts(session)
    this.sessions.delete(sessionKey)
    this.toolInvocations.forgetSession(session.sessionId)
  }

  private findSessionById(sessionId: string): ManagedAgentSession | undefined {
    return [...this.sessions.values()].find((candidate) => candidate.sessionId === sessionId)
  }

  private beginSessionToolClosing(session: ManagedAgentSession): void {
    session.isStopping = true
    this.toolInvocations.beginSessionClosing(session.sessionId)
    unregisterAgentMcpEndpoint(session, this.mcpServerPort)
  }

  private async settleSessionToolCalls(session: ManagedAgentSession): Promise<void> {
    await this.approvalCoordinator.cancelSession(session.sessionId)
    await this.toolInvocations.waitForSession(session.sessionId)
  }

  private async disposeLaunchArtifacts(session: ManagedAgentSession): Promise<void> {
    const artifacts = session.launchArtifacts
    session.launchArtifacts = []
    await Promise.allSettled(artifacts.map((artifact) => artifact.dispose()))
  }

  private updateActivity(
    session: ManagedAgentSession,
    sessionId: string,
    activity: NonNullable<ManagedAgentSession['activity']>
  ): void {
    if (session.sessionId !== sessionId || session.activity === activity) return
    session.activity = activity
    session.callbacks.onActivityChanged?.({ activity, agentId: session.agentId, sessionId })
  }
}
