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
  private readonly generationsBySlot = new Map<string, number>()
  private readonly slotOperationTails = new Map<string, Promise<void>>()
  private readonly terminationPromises = new Map<string, Promise<TerminalSessionSnapshot>>()
  private readonly resourceUntrackers = new Map<string, () => void>()
  private readonly managedTerminators = new Map<string, () => Promise<void>>()

  constructor(
    private readonly terminalProcessPort: TerminalProcessPort,
    private readonly scopeValidation: RunRuntimeScopeValidationPort = noopRunRuntimeScopeValidationPort,
    private readonly lifecycle?: RunLifecycleService
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

  private async startInSlot(
    command: StartTerminalSessionCommand,
    owner: TerminalRunOwner,
    slotKey: string
  ): Promise<TerminalSessionSnapshot> {
    const existingSessionId = this.sessionIdsBySlot.get(slotKey)

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

    let launchCommand = command.launchCommand
    let environment = command.environment
    if (command.prepareLaunch) {
      try {
        const prepared = await command.prepareLaunch(session.scope)
        launchCommand = prepared.launchCommand
        environment = prepared.environment
      } catch (error) {
        this.sessions.delete(session.id)
        if (this.sessionIdsBySlot.get(slotKey) === session.id) {
          this.sessionIdsBySlot.delete(slotKey)
        }
        throw error
      }
    }

    let processHandle

    try {
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
            command.onOutput(event)
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

    session.recordInput(input)
    this.terminalProcessPort.write(sessionId, input)

    return session.toSnapshot()
  }

  interrupt(sessionId: string): TerminalSessionSnapshot {
    const session = this.requireRunningSession(sessionId)

    this.terminalProcessPort.write(sessionId, '\x03')

    return session.toSnapshot()
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.requireRunningSession(sessionId)
    this.terminalProcessPort.resize(sessionId, columns, rows)
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

  terminate(sessionId: string): Promise<TerminalSessionSnapshot> {
    const managedTerminator = this.managedTerminators.get(sessionId)
    if (!managedTerminator) return this.terminateProcess(sessionId)
    return managedTerminator().then(() => this.requireSession(sessionId).toSnapshot())
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
        Promise.resolve().then(() => this.terminalProcessPort.disposeAll())
      ]))
    )

    for (const session of this.sessions.values()) {
      if (session.status === 'running' || session.status === 'stopping') {
        session.markExited({ exitCode: null })
      }
    }

    this.sessionIdsBySlot.clear()
    for (const unregister of this.resourceUntrackers.values()) {
      try {
        unregister()
      } catch (error) {
        cleanupResults.push({ status: 'rejected', reason: error })
      }
    }
    this.resourceUntrackers.clear()
    this.managedTerminators.clear()
    throwCleanupFailures(cleanupResults)
  }

  private requireSession(sessionId: string): TerminalSession {
    const session = this.sessions.get(sessionId)

    if (!session) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Terminal session was not found.')
    }

    return session
  }

  private requireRunningSession(sessionId: string): TerminalSession {
    const session = this.requireSession(sessionId)

    if (session.status !== 'running') {
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'Terminal session is not running.'
      )
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
