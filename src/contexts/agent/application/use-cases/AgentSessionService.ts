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
import type { AgentLaunchPlan } from '../ports/AgentProviderContribution'
import type { AgentSession } from '../../domain/aggregates/AgentSession'
import type { AgentToolExecutionResult } from './ExecuteAgentToolUseCase'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { AgentLaunchArtifactScope } from '../services/AgentLaunchArtifactScope'
import { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import {
  AgentToolApprovalCoordinator,
  type AgentToolExecutionOperations
} from './AgentToolApprovalCoordinator'
import { AgentApplicationShutdownCoordinator } from './AgentApplicationShutdownCoordinator'
import { AgentProviderSessionPersistenceCoordinator } from './AgentProviderSessionPersistenceCoordinator'
import { disposeOtherAgentSessionScopes } from './AgentSessionCollection'
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
  beginAgentTerminalRuntime,
  canLaunchAgentProvider,
  createAgentLaunchRuntimeController,
  createAgentSessionCallbacks,
  createAgentConversationScope,
  createInitialAgentRuntime,
  createAgentRuntimeSessionId,
  disposeAllAgentSessionRuntimeResources,
  disposeAgentLaunchArtifacts,
  findOwnedManagedAgentSession,
  recordAgentMcpRegistrationFailure,
  recordAgentSessionStartFailure,
  recordAgentSessionStopFailure,
  recordAgentTerminalExit,
  recordAgentTerminalRunning,
  recordAgentTerminalStartFailure,
  recordAgentTerminalStopped,
  registerAgentMcpEndpoint,
  requireManagedAgentSession,
  toAgentSessionSnapshot,
  transitionAgentRuntime,
  unregisterAgentMcpEndpoint,
  validateAgentProviderAvailability,
  validateAgentRuntimeScope,
  validateManagedAgentRuntimeScope,
  type AttachAgentSessionCommand,
  type ManagedAgentSession
} from './AgentSessionRuntimeState'

export class AgentSessionService {
  private readonly sessions = new Map<string, ManagedAgentSession>()
  private readonly approvalCoordinator: AgentToolApprovalCoordinator
  private readonly applicationShutdown: AgentApplicationShutdownCoordinator
  private readonly persistence: AgentProviderSessionPersistenceCoordinator
  private readonly toolInvocations: AgentToolInvocationCoordinator
  private readonly runtimeCoordinator = new AgentSessionRuntimeCoordinator()
  private isApplicationShuttingDown = false

  constructor(
    private readonly terminalRuntime: AgentTerminalRuntimePort,
    private readonly mcpServerPort: AgentMcpServerPort,
    toolExecution: AgentToolExecutionOperations,
    private readonly sessionRepository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly defaultProviderId: string,
    private readonly scopeValidation: AgentRuntimeScopeValidationPort = allowAgentRuntimeScope,
    private readonly providerAvailability = new AgentProviderAvailabilityService(providers)
  ) {
    this.toolInvocations = new AgentToolInvocationCoordinator(toolExecution)
    this.approvalCoordinator = new AgentToolApprovalCoordinator(this.toolInvocations, (sessionId) =>
      this.findSessionById(sessionId)
    )
    this.persistence = new AgentProviderSessionPersistenceCoordinator(sessionRepository, providers)
    this.applicationShutdown = new AgentApplicationShutdownCoordinator({
      beginClosing: (session) => this.beginSessionToolClosing(session),
      clearRuntime: () => this.runtimeCoordinator.clear(),
      clearSessions: () => this.sessions.clear(),
      disposeMcpServer: () => this.mcpServerPort.dispose(),
      forgetSession: (sessionId) => this.toolInvocations.forgetSession(sessionId),
      listSessions: () => [...this.sessions.values()],
      releaseTerminalReferences: () => this.terminalRuntime.releaseApplicationShutdown(),
      settleTools: (session) => this.settleSessionToolCalls(session),
      stopAdmission: () => {
        this.isApplicationShuttingDown = true
        this.runtimeCoordinator.stop()
      },
      waitForAdmissionIdle: () => this.runtimeCoordinator.waitForIdle(),
      waitForPersistence: () => this.persistence.waitForIdle()
    })
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
      (command.restartMode === undefined ||
        existingSession.runtime.launch.status === 'launching' ||
        existingSession.runtime.launch.status === 'running')
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
        await this.persistence.waitForIdle()
        await this.sessionRepository.delete(scope)
        existingSession.providerSessionRef = null
        transitionAgentRuntime(existingSession, { binding: 'unbound' })
      }
      existingSession.isStopping = false
      this.toolInvocations.reopenSession(existingSession.sessionId)
      try {
        await this.registerMcpEndpoint(existingSession)
        await this.launchManagedProvider(existingSession)
      } catch {
        recordAgentSessionStartFailure(existingSession)
        this.beginSessionToolClosing(existingSession)
      }
      return toAgentSessionSnapshot(existingSession)
    }
    if (existingSession) {
      await this.disposeManagedSession(sessionKey, existingSession)
    }
    await disposeOtherAgentSessionScopes(
      this.sessions,
      command.workspaceDirectory,
      command.agentId,
      sessionKey,
      (key, session) => this.disposeManagedSession(key, session)
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
        providerId: command.providerId ?? this.defaultProviderId,
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
    const providerId = workspaceAgent?.providerId ?? command.providerId ?? this.defaultProviderId
    const mcpSupport = this.providers.require(providerId).descriptor.capabilities.cleancodeMcp
    const providerSessionRef = persistedSession?.boundProviderSessionRef?.toSnapshot() ?? null
    const cleancodeMcpEnabled = workspaceAgent?.cleancodeMcpEnabled ?? mcpSupport !== 'unsupported'
    const session: ManagedAgentSession = {
      agentId: command.agentId,
      callbacks: createAgentSessionCallbacks(command),
      cleancodeMcpEnabled,
      columns: command.columns ?? 88,
      gitBranch: scope.toSnapshot().gitBranch,
      isTerminalRunning: false,
      isStopping: false,
      launchArtifacts: null,
      mcpSupport,
      shouldPersist,
      projectDirectory: command.projectDirectory,
      projectId: scope.toSnapshot().projectId,
      providerId,
      providerLaunchGeneration: 0,
      providerSessionRef,
      rows: command.rows ?? 24,
      runtime: createInitialAgentRuntime({
        binding: providerSessionRef ? 'persisted' : 'unbound',
        mcp: !cleancodeMcpEnabled
          ? 'disabled'
          : mcpSupport === 'unsupported'
            ? 'unsupported'
            : 'inactive'
      }),
      scope,
      sessionId: createAgentRuntimeSessionId(),
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: command.workspaceDirectory,
      workspaceName: command.workspaceName
    }
    this.sessions.set(sessionKey, session)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch {
      recordAgentSessionStartFailure(session)
      this.toolInvocations.beginSessionClosing(session.sessionId)
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
    if (this.isApplicationShuttingDown) {
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session service is shutting down.'
      )
    }
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
    await disposeAllAgentSessionRuntimeResources({
      beginClosing: (session) => this.beginSessionToolClosing(session),
      disposeMcpServer: () => this.mcpServerPort.dispose(),
      disposeTerminalRuntime: () => this.terminalRuntime.disposeAll(),
      sessions,
      settleTools: (session) => this.settleSessionToolCalls(session),
      waitForPersistence: () => this.persistence.waitForIdle()
    })
    this.sessions.clear()
    this.runtimeCoordinator.clear()
    for (const session of sessions) this.toolInvocations.forgetSession(session.sessionId)
  }

  prepareApplicationShutdown(): Promise<void> {
    return this.applicationShutdown.prepare()
  }

  completeApplicationShutdown(): Promise<void> {
    return this.applicationShutdown.complete()
  }

  private async suspendRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<boolean> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.runtime.terminal.status !== 'running') return false
    session.isStopping = true
    this.toolInvocations.beginSessionClosing(session.sessionId)
    try {
      await this.settleSessionToolCalls(session)
      await this.terminalRuntime.stop(session.sessionId)
    } catch (error) {
      this.toolInvocations.reopenSession(session.sessionId)
      recordAgentSessionStopFailure(session)
      throw error
    }
    recordAgentTerminalStopped(session, 'suspended')
    unregisterAgentMcpEndpoint(session)
    await disposeAgentLaunchArtifacts(session)
    await this.persistence.waitForIdle()
    session.isStopping = false
    return true
  }

  private async resumeRuntimeOwner(owner: AgentSessionRuntimeOwner): Promise<void> {
    const session = findOwnedManagedAgentSession(this.sessions.values(), owner)
    if (!session || session.runtime.terminal.status !== 'suspended') return

    session.isStopping = false
    this.toolInvocations.reopenSession(session.sessionId)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch (error) {
      this.toolInvocations.beginSessionClosing(session.sessionId)
      recordAgentSessionStartFailure(session)
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
    if (!session || session.runtime.terminal.status !== 'running') return null
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    const replacedSessionId = session.sessionId
    session.isStopping = true
    this.toolInvocations.beginSessionClosing(replacedSessionId)
    try {
      await this.settleSessionToolCalls(session)
      await this.terminalRuntime.stop(replacedSessionId)
    } catch (error) {
      this.toolInvocations.reopenSession(replacedSessionId)
      recordAgentSessionStopFailure(session)
      throw error
    }
    recordAgentTerminalStopped(session, 'exited')
    unregisterAgentMcpEndpoint(session)
    await disposeAgentLaunchArtifacts(session)
    session.cleancodeMcpEnabled = cleancodeMcpEnabled
    session.isStopping = false
    session.isTerminalRunning = false
    session.sessionId = createAgentRuntimeSessionId()
    session.runtime = createInitialAgentRuntime({
      binding: session.providerSessionRef ? 'persisted' : 'unbound',
      mcp: cleancodeMcpEnabled
        ? session.mcpSupport === 'unsupported'
          ? 'unsupported'
          : 'inactive'
        : 'disabled'
    })
    this.toolInvocations.forgetSession(replacedSessionId)
    try {
      await this.registerMcpEndpoint(session)
      await this.startManagedProcess(session)
    } catch {
      recordAgentSessionStartFailure(session)
      this.toolInvocations.beginSessionClosing(session.sessionId)
    }

    return toAgentSessionSnapshot(session)
  }

  private async startManagedProcess(session: ManagedAgentSession): Promise<void> {
    if (this.isApplicationShuttingDown) {
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session service is shutting down.'
      )
    }
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    await this.providerAvailability.inspect(session.providerId, { refresh: true })
    if (this.isApplicationShuttingDown) {
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session service is shutting down.'
      )
    }
    const processSessionId = session.sessionId
    let exitObserved = false
    beginAgentTerminalRuntime(session)
    try {
      const handle = await this.terminalRuntime.open({
        agentId: session.agentId,
        columns: session.columns,
        gitBranch: session.gitBranch,
        onTerminalExit: (exitCode) => {
          if (session.sessionId !== processSessionId) return
          exitObserved = true
          const shouldCloseTools = !session.isStopping
          if (shouldCloseTools) this.beginSessionToolClosing(session)
          recordAgentTerminalExit(session, processSessionId, exitCode)
          if (shouldCloseTools) void this.settleSessionToolCalls(session)
        },
        projectDirectory: session.projectDirectory,
        projectId: session.projectId,
        rows: session.rows,
        sessionId: processSessionId,
        terminalSourceTheme: session.terminalSourceTheme,
        workspaceDirectory: session.workspaceDirectory,
        workspaceName: session.workspaceName
      })
      if (exitObserved || !recordAgentTerminalRunning(session, processSessionId, handle)) return
      if (this.isApplicationShuttingDown) {
        this.beginSessionToolClosing(session)
        return
      }
    } catch (error) {
      recordAgentTerminalStartFailure(session)
      throw error
    }
    await this.launchManagedProvider(session, false)
  }
  private async launchManagedProvider(session: ManagedAgentSession, refresh = true): Promise<void> {
    await validateManagedAgentRuntimeScope(session, this.scopeValidation)
    const providerLaunchGeneration = ++session.providerLaunchGeneration
    await disposeAgentLaunchArtifacts(session)
    await this.persistence.waitForIdle()
    const processSessionId = session.sessionId
    if (!canLaunchAgentProvider(session, processSessionId)) return
    const provider = this.providers.require(session.providerId)
    await validateAgentProviderAvailability(provider, this.providerAvailability, refresh)
    transitionAgentRuntime(session, {
      activity: 'unavailable',
      launch: { exitCode: null, failureKind: null, launchId: null, status: 'launching' }
    })
    const artifacts = new AgentLaunchArtifactScope()
    session.launchArtifacts = artifacts
    let plan: AgentLaunchPlan
    try {
      plan = await provider.launcher.createLaunchPlan({
        artifacts,
        cleancodeMcp: session.mcpRegistration
          ? {
              bearerToken: session.mcpRegistration.bearerToken,
              serverUrl: session.mcpRegistration.url
            }
          : undefined,
        onProviderSessionIdentified: (sessionRef) => {
          if (
            session.sessionId !== processSessionId ||
            session.providerLaunchGeneration !== providerLaunchGeneration ||
            session.isStopping
          )
            return
          this.persistence.persist(session, sessionRef, providerLaunchGeneration)
        },
        onActivityChanged: (activity) => {
          if (
            session.sessionId !== processSessionId ||
            session.providerLaunchGeneration !== providerLaunchGeneration ||
            session.isStopping
          )
            return
          transitionAgentRuntime(session, { activity })
        },
        providerSessionRef: session.providerSessionRef ?? undefined,
        workspaceDirectory: session.workspaceDirectory
      })
      artifacts.seal()
    } catch (error) {
      artifacts.seal()
      try {
        await disposeAgentLaunchArtifacts(session)
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Agent launch setup and artifact cleanup both failed.'
        )
      }
      throw error
    }
    if (!canLaunchAgentProvider(session, processSessionId)) {
      await disposeAgentLaunchArtifacts(session)
      return
    }
    try {
      const lifecycle = createAgentLaunchRuntimeController({
        attempt: providerLaunchGeneration,
        onUnexpectedExit: () => {
          this.beginSessionToolClosing(session)
          void this.settleSessionToolCalls(session)
        },
        session,
        sessionId: processSessionId
      })
      const launch = this.terminalRuntime.launch({
        onExit: lifecycle.onExit,
        onStarted: lifecycle.onStarted,
        plan,
        sessionId: processSessionId
      })
      lifecycle.bind(launch)
    } catch (error) {
      await disposeAgentLaunchArtifacts(session)
      throw error
    }
  }

  private async registerMcpEndpoint(session: ManagedAgentSession): Promise<void> {
    if (this.isApplicationShuttingDown) {
      this.beginSessionToolClosing(session)
      return
    }
    if (!session.cleancodeMcpEnabled || session.mcpSupport === 'unsupported') {
      await registerAgentMcpEndpoint(session, this.mcpServerPort, (toolCommand) =>
        this.executeMcpTool(toolCommand)
      )
      this.toolInvocations.beginSessionClosing(session.sessionId)
      return
    }
    this.toolInvocations.reopenSession(session.sessionId)
    try {
      await registerAgentMcpEndpoint(session, this.mcpServerPort, (toolCommand) =>
        this.executeMcpTool(toolCommand)
      )
    } catch (error) {
      recordAgentMcpRegistrationFailure(session)
      this.toolInvocations.beginSessionClosing(session.sessionId)
      if (session.mcpSupport === 'required') throw error
    }
  }

  private async disposeManagedSession(
    sessionKey: string,
    session: ManagedAgentSession
  ): Promise<void> {
    this.beginSessionToolClosing(session)
    await this.settleSessionToolCalls(session)
    if (session.isTerminalRunning) {
      await this.terminalRuntime.stop(session.sessionId)
      recordAgentTerminalStopped(session, 'exited')
    }
    await disposeAgentLaunchArtifacts(session)
    this.sessions.delete(sessionKey)
    this.toolInvocations.forgetSession(session.sessionId)
  }

  private findSessionById(sessionId: string): ManagedAgentSession | undefined {
    return [...this.sessions.values()].find((candidate) => candidate.sessionId === sessionId)
  }

  private beginSessionToolClosing(session: ManagedAgentSession): void {
    session.isStopping = true
    this.toolInvocations.beginSessionClosing(session.sessionId)
    unregisterAgentMcpEndpoint(session)
  }

  private async settleSessionToolCalls(session: ManagedAgentSession): Promise<void> {
    await this.approvalCoordinator.cancelSession(session.sessionId)
    await this.toolInvocations.waitForSession(session.sessionId)
  }
}
