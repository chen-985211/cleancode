import { TerminalSession } from '../../domain/aggregates/TerminalSession'
import {
  createTerminalRunScope,
  createTerminalRunSlotKey,
  type TerminalRunOwner,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type {
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../dto/TerminalModelSnapshot'
import type { TerminalModelPort, TerminalViewOutputEvent } from '../ports/TerminalModelPort'
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

export interface TerminalViewIdentityCommand {
  readonly projectId: string
  readonly workspaceName: string
  readonly blockId: string
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
  readonly viewId: string
}

export interface AttachTerminalViewCommand extends TerminalViewIdentityCommand {
  readonly onOutput: (event: TerminalViewOutputEvent) => void
}

export interface StartTerminalSessionCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly workingDirectory: string
  readonly runId?: string
  readonly shell?: string
  readonly launchCommand?: string
  readonly environment?: Readonly<Record<string, string>>
  readonly prepareLaunch?: (scope: TerminalRunScope) => Promise<{
    readonly launchCommand: string | undefined
    readonly environment: Readonly<Record<string, string>> | undefined
  }>
  readonly trackLifecycle?: boolean
  readonly onStartedWithinGate?: (session: TerminalSessionSnapshot) => void
  readonly columns?: number
  readonly rows?: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

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
    private readonly terminalModelPort?: TerminalModelPort
  ) {}

  async start(command: StartTerminalSessionCommand): Promise<TerminalSessionSnapshot> {
    const owner = createOwner(command)
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

  private async startInSlot(
    command: StartTerminalSessionCommand,
    owner: TerminalRunOwner,
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
        sessionId: createId('terminal-session'),
        runId: command.runId ?? createId('terminal-run'),
        generation
      }),
      workingDirectory: command.workingDirectory
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
        session.markFailed({ reason: getErrorMessage(error) })
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
        shell: command.shell,
        launchCommand,
        environment,
        columns: command.columns ?? 88,
        rows: command.rows ?? 24,
        onOutput: (event) => {
          if (this.isCurrentRunningSession(slotKey, session)) {
            const output = this.terminalModelPort
              ? this.terminalModelPort.acceptOutput(session.scope, event.data)
              : this.acceptFallbackOutput(session.id, event.data)
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
          this.untrackSession(session.id)
          if (!wasStopping && wasCurrentGeneration) {
            command.onExit(event)
          }
        }
      })
    } catch (error) {
      this.terminalModelPort?.retire(session.scope)
      if (this.sessionIdsBySlot.get(slotKey) === session.id) {
        this.sessionIdsBySlot.delete(slotKey)
      }
      if (this.restorableSessionIdsBySlot.get(slotKey) === session.id) {
        this.restorableSessionIdsBySlot.delete(slotKey)
      }
      session.markFailed({ reason: getErrorMessage(error) })

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
    const terminalModelPort = this.requireTerminalModelPort()
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
    const session = this.requireRestorableSession(command)
    await this.requireTerminalModelPort().detachView(session.scope, command.viewId)
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
    throwCleanupFailures(cleanupResults)
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
      this.terminalModelPort?.retire(session.scope)
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

  private requireRestorableSession(command: TerminalViewIdentityCommand): TerminalSession {
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

  private requireTerminalModelPort(): TerminalModelPort {
    if (!this.terminalModelPort) {
      throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
    }
    return this.terminalModelPort
  }

  private acceptFallbackOutput(sessionId: string, data: string) {
    const sequence = (this.fallbackOutputSequences.get(sessionId) ?? 0) + 1
    this.fallbackOutputSequences.set(sessionId, sequence)
    return { data, sequence }
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function throwCleanupFailures(results: readonly PromiseSettledResult<void>[]): void {
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, 'Multiple terminal session resources failed to dispose.')
}

function createOwner(command: StartTerminalSessionCommand): TerminalRunOwner {
  return {
    projectId: command.projectId,
    projectDirectory: command.projectDirectory,
    workspaceName: command.workspaceName,
    workspaceDirectory: command.workspaceDirectory,
    gitBranch: command.gitBranch,
    blockId: command.terminalBlockId
  }
}

function createId(prefix: string): string {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random()}`
}
