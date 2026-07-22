import { TerminalSession } from '../../domain/aggregates/TerminalSession'
import {
  createTerminalRunScope,
  createTerminalRunSlotKey,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type {
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../dto/TerminalModelSnapshot'
import type { TerminalScrollbackRows } from '../dto/TerminalRuntimeSettings'
import type { TerminalLinkIdentity } from '../dto/TerminalLink'
import type { TerminalLinkContext } from '../ports/TerminalLinkPorts'
import type { TerminalModelPort } from '../ports/TerminalModelPort'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalProcessPort,
  TerminalWorkingDirectorySnapshot
} from '../ports/TerminalProcessPort'
import {
  noopRunRuntimeScopeValidationPort,
  type RunRuntimeScopeValidationPort
} from '../ports/RunRuntimeScopeValidationPort'
import type { RunLifecycleService } from './RunLifecycleService'
import type {
  TerminalRuntimeProviderPort,
  TerminalRuntimeRecoveryResult
} from '../ports/TerminalRuntimeProviderPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type {
  AttachTerminalViewCommand,
  StartTerminalSessionCommand,
  TerminalViewIdentityCommand
} from './TerminalSessionCommands'
import {
  createTerminalSessionId,
  createTerminalSessionOwner,
  getTerminalSessionErrorMessage,
  requireTerminalModelPort,
  settleTerminalViewRelease,
  throwTerminalSessionCleanupFailures
} from './TerminalSessionServiceSupport'

export type {
  AttachTerminalViewCommand,
  TerminalViewIdentityCommand
} from './TerminalSessionCommands'

export class TerminalSessionService {
  private readonly sessions = new Map<string, TerminalSession>()
  private readonly sessionIdsBySlot = new Map<string, string>()
  private readonly restorableSessionIdsBySlot = new Map<string, string>()
  private readonly generationsBySlot = new Map<string, number>()
  private readonly slotOperationTails = new Map<string, Promise<void>>()
  private readonly terminationPromises = new Map<string, Promise<TerminalSessionSnapshot>>()
  private readonly resourceUntrackers = new Map<string, () => void>()
  private readonly managedTerminators = new Map<string, () => Promise<void>>()
  private readonly fallbackOutputSequences = new Map<string, number>()

  constructor(
    private readonly terminalProcessPort: TerminalProcessPort,
    private readonly scopeValidation: RunRuntimeScopeValidationPort = noopRunRuntimeScopeValidationPort,
    private readonly lifecycle?: RunLifecycleService,
    private readonly terminalModelPort?: TerminalModelPort,
    private readonly runtimeProvider?: TerminalRuntimeProviderPort
  ) {}

  async initializeRuntime(callbacks: {
    readonly onOutput: (event: TerminalOutputEvent) => void
    readonly onExit: (event: TerminalExitEvent) => void
    readonly onSessionUpdated?: (session: TerminalSessionSnapshot) => void
  }): Promise<TerminalRuntimeRecoveryResult> {
    if (!this.runtimeProvider) return { sessions: [], issues: [], managedServiceEndpoints: [] }
    this.runtimeProvider.bindRecoveryIssueHandler?.((issue) => {
      if (!issue.sessionId) return
      const session = this.sessions.get(issue.sessionId)
      if (
        !session ||
        session.status !== 'running' ||
        session.retentionPolicy !== 'keep-after-application-exit'
      ) {
        return
      }
      session.setRetentionPolicy('terminate-on-application-exit')
      callbacks.onSessionUpdated?.(session.toSnapshot())
    })
    const recovered = await this.runtimeProvider.initialize()
    const accepted: TerminalSessionSnapshot[] = []

    for (const snapshot of recovered.sessions) {
      if (
        snapshot.kind === 'workflow' ||
        (snapshot.recoveryKind !== 'warm' && snapshot.recoveryKind !== 'historical')
      ) {
        await this.retireTerminalModel(snapshot)
        continue
      }
      try {
        await this.scopeValidation.validate({
          projectId: snapshot.projectId,
          projectDirectory: snapshot.projectDirectory,
          workspaceName: snapshot.workspaceName,
          workspaceDirectory: snapshot.workspaceDirectory,
          gitBranch: snapshot.gitBranch
        })
      } catch {
        await this.retireTerminalModel(snapshot)
        continue
      }

      const slotKey = createTerminalRunSlotKey(snapshot)
      const previousGeneration = this.generationsBySlot.get(slotKey) ?? 0
      if (snapshot.generation < previousGeneration) {
        await this.retireTerminalModel(snapshot)
        continue
      }
      const previousSessionId = this.restorableSessionIdsBySlot.get(slotKey)
      if (previousSessionId) {
        const previous = this.sessions.get(previousSessionId)
        if (previous) await this.retireTerminalModel(previous.scope)
        this.sessions.delete(previousSessionId)
      }

      const session = TerminalSession.revive({
        scope: snapshot,
        workingDirectory: snapshot.workingDirectory,
        kind: snapshot.kind,
        retentionPolicy: snapshot.retentionPolicy,
        recoveryKind: snapshot.recoveryKind,
        terminalSourceTheme: snapshot.terminalSourceTheme,
        processId: snapshot.processId,
        inputHistory: snapshot.inputHistory,
        exitCode: snapshot.exitCode,
        failureReason: snapshot.failureReason
      })
      this.sessions.set(session.id, session)
      this.generationsBySlot.set(slotKey, snapshot.generation)
      this.restorableSessionIdsBySlot.set(slotKey, session.id)
      if (session.status === 'running') {
        this.sessionIdsBySlot.set(slotKey, session.id)
      }
      if (this.lifecycle) {
        this.resourceUntrackers.set(
          session.id,
          this.lifecycle.track(session.scope, async () =>
            this.terminate(session.id).then(() => undefined)
          )
        )
      }
      this.runtimeProvider.bindRecoveredSession(session.scope, {
        onOutput: (event) => {
          if (!this.isCurrentRunningSession(slotKey, session) || event.sequence === undefined)
            return
          callbacks.onOutput({ ...event, sequence: event.sequence })
        },
        onExit: (event) => {
          const wasCurrent = this.isCurrentGeneration(slotKey, session)
          session.markExited({ exitCode: event.exitCode })
          if (this.sessionIdsBySlot.get(slotKey) === session.id) {
            this.sessionIdsBySlot.delete(slotKey)
          }
          if (wasCurrent) callbacks.onExit(event)
        }
      })
      accepted.push(session.toSnapshot())
    }

    return {
      sessions: accepted,
      issues: recovered.issues,
      managedServiceEndpoints: recovered.managedServiceEndpoints.filter((candidate) =>
        accepted.some((session) => session.sessionId === candidate.scope.sessionId)
      )
    }
  }

  async start(command: StartTerminalSessionCommand): Promise<TerminalSessionSnapshot> {
    const owner = createTerminalSessionOwner(command)
    const slotKey = createTerminalRunSlotKey(owner)

    const operation = () =>
      this.enqueueSlot(slotKey, () => this.startInSlot(command, owner, slotKey))
    return this.lifecycle ? this.lifecycle.runStart(owner, operation) : operation()
  }

  getSession(sessionId: string): TerminalSessionSnapshot | null {
    return this.sessions.get(sessionId)?.toSnapshot() ?? null
  }

  listSessions(sessionIds: readonly string[]): TerminalSessionSnapshot[] {
    return sessionIds.flatMap((sessionId) => {
      const session = this.sessions.get(sessionId)
      return session ? [session.toSnapshot()] : []
    })
  }

  listAllSessions(): TerminalSessionSnapshot[] {
    return [...this.sessions.values()].map((session) => session.toSnapshot())
  }

  async setRetentionPolicy(
    sessionId: string,
    retentionPolicy: TerminalRetentionPolicy
  ): Promise<TerminalSessionSnapshot> {
    const session = this.requireSession(sessionId)
    const previous = session.retentionPolicy
    session.setRetentionPolicy(retentionPolicy)
    try {
      await this.runtimeProvider?.setRetentionPolicy(sessionId, retentionPolicy)
    } catch (error) {
      session.setRetentionPolicy(previous)
      throw error
    }
    return session.toSnapshot()
  }

  recordManagedServiceEndpoint(sessionId: string, endpoint: ActualServiceEndpoint): Promise<void> {
    return (
      this.runtimeProvider?.recordManagedServiceEndpoint(sessionId, endpoint) ?? Promise.resolve()
    )
  }

  async prepareApplicationShutdown(): Promise<void> {
    if (!this.runtimeProvider) {
      await this.stopAll()
      return
    }
    const results = await Promise.allSettled(
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.status === 'running' &&
            session.retentionPolicy === 'terminate-on-application-exit'
        )
        .map((session) => this.terminate(session.id))
    )
    await this.runtimeProvider.detachApplication()
    throwTerminalSessionCleanupFailures(
      results.map((result) =>
        result.status === 'fulfilled' ? { status: 'fulfilled', value: undefined } : result
      )
    )
  }

  private async startInSlot(
    command: StartTerminalSessionCommand,
    owner: ReturnType<typeof createTerminalSessionOwner>,
    slotKey: string
  ): Promise<TerminalSessionSnapshot> {
    const existingSessionId =
      this.sessionIdsBySlot.get(slotKey) ?? this.restorableSessionIdsBySlot.get(slotKey)

    if (existingSessionId) {
      await this.terminate(existingSessionId)
    }

    try {
      await this.scopeValidation.validate({
        projectId: owner.projectId,
        projectDirectory: owner.projectDirectory,
        workspaceName: owner.workspaceName,
        workspaceDirectory: owner.workspaceDirectory,
        gitBranch: owner.gitBranch
      })
    } catch {
      throw createExpectedAppError(
        'RUN_SCOPE_STALE',
        'Project no longer owns the requested terminal runtime scope.'
      )
    }

    const generation = (this.generationsBySlot.get(slotKey) ?? 0) + 1
    this.generationsBySlot.set(slotKey, generation)
    const session = TerminalSession.create({
      scope: createTerminalRunScope({
        ...owner,
        sessionId: createTerminalSessionId('terminal-session'),
        runId: command.runId ?? createTerminalSessionId('terminal-run'),
        generation
      }),
      workingDirectory: command.workingDirectory,
      kind: command.sessionKind,
      terminalSourceTheme: command.terminalSourceTheme
    })
    this.sessions.set(session.id, session)
    this.sessionIdsBySlot.set(slotKey, session.id)
    this.restorableSessionIdsBySlot.set(slotKey, session.id)

    let launchCommand = command.launchCommand
    let environment = command.environment
    if (command.prepareLaunch) {
      try {
        const prepared = await command.prepareLaunch(session.scope)
        launchCommand = prepared.launchCommand
        environment = prepared.environment
      } catch (error) {
        session.markFailed({ reason: getTerminalSessionErrorMessage(error) })
        if (this.sessionIdsBySlot.get(slotKey) === session.id) {
          this.sessionIdsBySlot.delete(slotKey)
        }
        if (this.restorableSessionIdsBySlot.get(slotKey) === session.id) {
          this.restorableSessionIdsBySlot.delete(slotKey)
        }
        throw error
      }
    }

    let processHandle

    try {
      this.terminalModelPort?.create({
        identity: session.scope,
        columns: command.columns ?? 88,
        rows: command.rows ?? 24,
        workingDirectory: command.workingDirectory,
        terminalSourceTheme: session.terminalSourceTheme,
        onQueryResponse: (response) => {
          if (this.isCurrentRunningSession(slotKey, session)) {
            this.terminalProcessPort.write(session.id, response)
          }
        },
        onFlowControlChange: (isPaused) => {
          if (!this.isCurrentRunningSession(slotKey, session)) return
          if (isPaused) this.terminalProcessPort.pauseOutput(session.id)
          else this.terminalProcessPort.resumeOutput(session.id)
        }
      })
      processHandle = await this.terminalProcessPort.start({
        scope: session.scope,
        workingDirectory: command.workingDirectory,
        terminalSourceTheme: session.terminalSourceTheme,
        shell: command.shell,
        launchCommand,
        launchMode: command.launchMode,
        sessionKind: session.kind,
        environment,
        columns: command.columns ?? 88,
        rows: command.rows ?? 24,
        onOutput: (event) => {
          if (this.isCurrentStartingOrRunningSession(slotKey, session)) {
            const output =
              event.sequence === undefined
                ? this.terminalModelPort
                  ? this.terminalModelPort.acceptOutput(session.scope, event.data)
                  : this.acceptFallbackOutput(session.id, event.data)
                : { data: event.data, sequence: event.sequence }
            command.onOutput({ ...event, sequence: output.sequence })
          }
        },
        onExit: (event) => {
          const wasStopping = session.status === 'stopping'
          const wasCurrentGeneration = this.isCurrentGeneration(slotKey, session)
          session.markExited({ exitCode: event.exitCode })
          if (this.sessionIdsBySlot.get(slotKey) === session.id) {
            this.sessionIdsBySlot.delete(slotKey)
          }
          if (!wasStopping && wasCurrentGeneration) {
            command.onExit(event)
          }
        }
      })
    } catch (error) {
      await this.retireTerminalModel(session.scope)
      if (this.sessionIdsBySlot.get(slotKey) === session.id) {
        this.sessionIdsBySlot.delete(slotKey)
      }
      if (this.restorableSessionIdsBySlot.get(slotKey) === session.id) {
        this.restorableSessionIdsBySlot.delete(slotKey)
      }
      session.markFailed({ reason: getTerminalSessionErrorMessage(error) })

      return session.toSnapshot()
    }

    if (session.status === 'idle') {
      session.markRunning({ processId: processHandle.processId })
    }
    if (session.status === 'running' && this.lifecycle && command.trackLifecycle !== false) {
      this.resourceUntrackers.set(
        session.id,
        this.lifecycle.track(owner, async () => {
          await this.terminate(session.id)
        })
      )
    }
    if (session.status === 'running') {
      command.onStartedWithinGate?.(session.toSnapshot())
    }

    return session.toSnapshot()
  }

  write(sessionId: string, input: string): TerminalSessionSnapshot {
    const session = this.requireSession(sessionId)
    if (session.status !== 'running') return session.toSnapshot()

    session.recordInput(input)
    this.terminalProcessPort.write(sessionId, input)

    return session.toSnapshot()
  }

  interrupt(sessionId: string): TerminalSessionSnapshot {
    const session = this.requireSession(sessionId)
    if (session.status !== 'running') return session.toSnapshot()

    this.terminalProcessPort.write(sessionId, '\x03')

    return session.toSnapshot()
  }

  resize(sessionId: string, columns: number, rows: number): TerminalSessionSnapshot {
    const session = this.requireSession(sessionId)
    if (session.status !== 'running') return session.toSnapshot()
    this.terminalProcessPort.resize(sessionId, columns, rows)
    this.terminalModelPort?.resize(session.scope, columns, rows)
    return session.toSnapshot()
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    const session = this.requireRestorableSession(command)
    const terminalModelPort = requireTerminalModelPort(this.terminalModelPort)
    const workingDirectory = await this.terminalProcessPort.readWorkingDirectory(session.id)
    if (workingDirectory) {
      terminalModelPort.updateWorkingDirectory(session.scope, workingDirectory)
    }
    return terminalModelPort.attachView({
      identity: session.scope,
      viewId: command.viewId,
      onOutput: command.onOutput
    })
  }

  async detachView(command: TerminalViewIdentityCommand): Promise<void> {
    await settleTerminalViewRelease(() =>
      requireTerminalModelPort(this.terminalModelPort).detachView(
        this.requireRestorableSession(command).scope,
        command.viewId
      )
    )
  }

  async getTerminalLinkContext(command: TerminalLinkIdentity): Promise<TerminalLinkContext> {
    const session = this.requireRestorableSession(command)
    try {
      await this.scopeValidation.validate({
        projectId: session.scope.projectId,
        projectDirectory: session.scope.projectDirectory,
        workspaceName: session.scope.workspaceName,
        workspaceDirectory: session.scope.workspaceDirectory,
        gitBranch: session.scope.gitBranch
      })
    } catch {
      throw createExpectedAppError(
        'RUN_SCOPE_STALE',
        'Project no longer owns the requested terminal runtime scope.'
      )
    }

    let workingDirectory =
      this.terminalModelPort?.readWorkingDirectory(session.scope) ?? session.workingDirectory
    if (session.status === 'running') {
      workingDirectory =
        (await this.terminalProcessPort.readWorkingDirectory(session.id)) ?? workingDirectory
      this.terminalModelPort?.updateWorkingDirectory(session.scope, workingDirectory)
    }
    return { workingDirectory, workspaceDirectory: session.scope.workspaceDirectory }
  }

  getTerminalModelDiagnostics(): TerminalModelDiagnosticsSnapshot {
    return (
      this.terminalModelPort?.getDiagnostics() ?? {
        modelCount: 0,
        attachedViewCount: 0,
        pendingOutputBytes: 0,
        lastRestoreDurationMs: 0
      }
    )
  }

  updateTerminalScrollback(rows: TerminalScrollbackRows): void {
    this.terminalModelPort?.setScrollbackRows(rows)
  }

  async listWorkingDirectories(
    sessionIds: readonly string[]
  ): Promise<TerminalWorkingDirectorySnapshot[]> {
    const workingDirectories: TerminalWorkingDirectorySnapshot[] = []

    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId)

      if (!session || session.status !== 'running') {
        continue
      }

      const workingDirectory = await this.terminalProcessPort.readWorkingDirectory(sessionId)

      if (!workingDirectory) {
        continue
      }

      workingDirectories.push({ sessionId, workingDirectory })
    }

    return workingDirectories
  }

  terminate(sessionId: string): Promise<TerminalSessionSnapshot | null> {
    if (!this.sessions.has(sessionId)) return Promise.resolve(null)
    const managedTerminator = this.managedTerminators.get(sessionId)
    if (!managedTerminator) return this.terminateProcess(sessionId)
    return managedTerminator().then(() => this.sessions.get(sessionId)?.toSnapshot() ?? null)
  }

  terminateProcess(sessionId: string): Promise<TerminalSessionSnapshot> {
    return this.terminateSession(sessionId)
  }

  registerManagedTerminator(sessionId: string, terminate: () => Promise<void>): () => void {
    this.managedTerminators.set(sessionId, terminate)
    return () => {
      if (this.managedTerminators.get(sessionId) === terminate) {
        this.managedTerminators.delete(sessionId)
      }
    }
  }

  async stopAll(): Promise<void> {
    const cleanupResults: PromiseSettledResult<void>[] = await Promise.allSettled(
      [...this.managedTerminators.values()].map((terminate) => Promise.resolve().then(terminate))
    )
    for (const session of this.sessions.values()) {
      session.markStopping()
    }

    cleanupResults.push(
      ...(await Promise.allSettled([
        Promise.resolve().then(() => this.terminalProcessPort.disposeAll()),
        Promise.resolve().then(() => this.terminalModelPort?.disposeAll())
      ]))
    )

    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'stopping') {
        session.markExited({ exitCode: null })
      }
    }

    this.sessionIdsBySlot.clear()
    this.restorableSessionIdsBySlot.clear()
    for (const unregister of this.resourceUntrackers.values()) {
      try {
        unregister()
      } catch (error) {
        cleanupResults.push({ status: 'rejected', reason: error })
      }
    }
    this.resourceUntrackers.clear()
    this.managedTerminators.clear()
    this.fallbackOutputSequences.clear()
    throwTerminalSessionCleanupFailures(cleanupResults)
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId)

    if (!session) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Terminal session was not found.')
    }

    return session
  }

  private terminateSession(sessionId: string): Promise<TerminalSessionSnapshot> {
    const existing = this.terminationPromises.get(sessionId)

    if (existing) {
      return existing
    }

    const session = this.requireSession(sessionId)
    const slotKey = createTerminalRunSlotKey(session.scope)
    const termination = (async () => {
      if (session.status === 'running') {
        session.markStopping()
        await this.terminalProcessPort.stop(sessionId)
      }

      if (session.status === 'stopping') {
        session.markExited({ exitCode: null })
      }
      if (this.sessionIdsBySlot.get(slotKey) === session.id) {
        this.sessionIdsBySlot.delete(slotKey)
      }
      if (this.restorableSessionIdsBySlot.get(slotKey) === session.id) {
        this.restorableSessionIdsBySlot.delete(slotKey)
      }
      await this.retireTerminalModel(session.scope)
      this.fallbackOutputSequences.delete(session.id)
      this.untrackSession(session.id)

      return session.toSnapshot()
    })()
    this.terminationPromises.set(sessionId, termination)
    void termination.finally(() => this.terminationPromises.delete(sessionId))
    return termination
  }

  private isCurrentRunningSession(slotKey: string, session: TerminalSession): boolean {
    return session.status === 'running' && this.isCurrentGeneration(slotKey, session)
  }

  private isCurrentStartingOrRunningSession(slotKey: string, session: TerminalSession): boolean {
    return (
      (session.status === 'idle' || session.status === 'running') &&
      this.isCurrentGeneration(slotKey, session)
    )
  }

  private requireRestorableSession(command: TerminalLinkIdentity): TerminalSession {
    const session = this.requireSession(command.sessionId)
    const slotKey = createTerminalRunSlotKey(session.scope)
    const currentSessionId = this.sessionIdsBySlot.get(slotKey)
    const matchesIdentity =
      session.scope.projectId === command.projectId &&
      session.scope.workspaceName === command.workspaceName &&
      session.scope.blockId === command.blockId &&
      session.scope.sessionId === command.sessionId &&
      session.scope.runId === command.runId &&
      session.scope.generation === command.generation
    const isLatestGeneration = this.generationsBySlot.get(slotKey) === command.generation
    const isCurrentOrNaturallyExited =
      currentSessionId === session.id ||
      (currentSessionId === undefined &&
        session.status === 'exited' &&
        this.restorableSessionIdsBySlot.get(slotKey) === session.id)

    if (
      !matchesIdentity ||
      !isLatestGeneration ||
      !isCurrentOrNaturallyExited ||
      (session.status !== 'running' && session.status !== 'exited')
    ) {
      throw createExpectedAppError(
        'RUN_SCOPE_STALE',
        'Terminal view no longer matches the current runtime scope.'
      )
    }
    return session
  }

  private acceptFallbackOutput(sessionId: string, data: string) {
    const sequence = (this.fallbackOutputSequences.get(sessionId) ?? 0) + 1
    this.fallbackOutputSequences.set(sessionId, sequence)
    return { data, sequence }
  }

  private async retireTerminalModel(identity: TerminalRunScope): Promise<void> {
    if (this.runtimeProvider) {
      await this.runtimeProvider.retireSession(identity)
      return
    }
    await this.terminalModelPort?.retire(identity)
  }

  private untrackSession(sessionId: string): void {
    this.resourceUntrackers.get(sessionId)?.()
    this.resourceUntrackers.delete(sessionId)
  }

  private isCurrentGeneration(slotKey: string, session: TerminalSession): boolean {
    return (
      this.sessionIdsBySlot.get(slotKey) === session.id &&
      this.generationsBySlot.get(slotKey) === session.scope.generation
    )
  }

  private async enqueueSlot<T>(slotKey: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.slotOperationTails.get(slotKey) ?? Promise.resolve()
    const result = previous.catch(() => undefined).then(operation)
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.slotOperationTails.set(slotKey, tail)
    void tail.finally(() => {
      if (this.slotOperationTails.get(slotKey) === tail) {
        this.slotOperationTails.delete(slotKey)
      }
    })
    return result
  }
}
