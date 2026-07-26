import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TcpListenerInspectionPort } from '../ports/TcpListenerInspectionPort'
import type { TcpReadinessPort } from '../ports/TcpReadinessPort'
import type { TerminalExitEvent, TerminalOutputEvent } from '../ports/TerminalProcessPort'
import type { RunLifecycleService } from '../use-cases/RunLifecycleService'
import type { RecoveredManagedServiceEndpoint } from '../ports/TerminalRuntimeProviderPort'
import type { TerminalSessionService } from '../use-cases/TerminalSessionService'
import type { ServicePortLeaseSnapshot } from '../../domain/services/ServicePortLeaseRegistry'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import {
  applyServicePortBinding,
  validateServicePortIntent,
  type ServicePortIntent
} from '../../domain/value-objects/ServicePortIntent'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import type { LocalPortAllocation } from './LocalPortAllocator'
import type { LocalPortAllocator } from './LocalPortAllocator'
import { ManagedServiceApplicationShutdown } from './ManagedServiceApplicationShutdown'
import { createRunAttemptDetails } from './RunFailureDetails'
import {
  createManagedRunId,
  getErrorMessage,
  linkAbortSignal,
  markReleasing,
  quarantineIfReleasing,
  releaseReservationForActivation,
  releaseUnusedAllocation,
  waitForOutput,
  waitWithTimeout
} from './ManagedServiceLauncherSupport'

type ManagedServiceReadiness =
  { readonly type: 'output'; readonly text: string } | { readonly type: 'tcp' }

export interface LaunchManagedServiceCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly blockId: string
  readonly workingDirectory: string
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly launchCommand: string
  readonly environment?: Readonly<Record<string, string>>
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
  readonly runId?: string
  readonly portIntent: ServicePortIntent
  readonly readiness: ManagedServiceReadiness
  readonly readinessTimeoutMs: number
  readonly signal: AbortSignal
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
  readonly onSessionStarted: (session: TerminalSessionSnapshot) => void
  readonly onEndpointConfirmed?: (
    session: TerminalSessionSnapshot,
    endpoint: ActualServiceEndpoint
  ) => void
  readonly onPortStateChanged?: (
    session: TerminalSessionSnapshot,
    endpoint: ActualServiceEndpoint,
    state: 'releasing' | 'released' | 'quarantined'
  ) => void
  readonly onCleanupFailed?: (error: unknown) => void
}

export interface ManagedServiceRunSnapshot {
  readonly scope: TerminalRunScope
  readonly session: TerminalSessionSnapshot
  readonly endpoint: ActualServiceEndpoint
  readonly lease: ServicePortLeaseSnapshot
}

interface ActiveManagedService {
  readonly session: TerminalSessionSnapshot
  readonly allocation: LocalPortAllocation
  readonly readinessController: AbortController
  unregisterLifecycle: () => void
  unregisterManagedTerminator: () => void
  stopPromise: Promise<void> | null
  readonly reportCleanupFailure: (error: unknown) => void
  readonly reportPortState: (state: 'releasing' | 'released' | 'quarantined') => void
}

export class ManagedServiceLauncher {
  private readonly activeServices = new Map<string, ActiveManagedService>()
  private readonly activationControllers = new Set<AbortController>()
  private readonly applicationShutdown = new ManagedServiceApplicationShutdown()
  private readonly maxActivationAttempts: number
  private readonly cleanupTimeoutMs: number

  constructor(
    private readonly sessions: TerminalSessionService,
    private readonly allocator: LocalPortAllocator,
    private readonly readiness: TcpReadinessPort,
    private readonly listenerInspection: TcpListenerInspectionPort,
    private readonly lifecycle: RunLifecycleService,
    options: {
      readonly maxActivationAttempts?: number
      readonly cleanupTimeoutMs?: number
    } = {}
  ) {
    this.maxActivationAttempts = options.maxActivationAttempts ?? 3
    this.cleanupTimeoutMs = options.cleanupTimeoutMs ?? 2_000
  }

  launch(command: LaunchManagedServiceCommand): Promise<ManagedServiceRunSnapshot> {
    return this.applicationShutdown.runLaunch(() => this.launchManagedService(command))
  }

  private async launchManagedService(
    command: LaunchManagedServiceCommand
  ): Promise<ManagedServiceRunSnapshot> {
    const intent = validateServicePortIntent(command.portIntent)
    const runId = command.runId ?? createManagedRunId()

    for (let attempt = 0; attempt < this.maxActivationAttempts; attempt += 1) {
      const result = await this.activateAttempt(command, intent, runId)

      if (this.shouldDelegateToProvider(result.service)) {
        throw this.applicationShutdown.createBlockedError()
      }
      if (result.inspection === 'owned') {
        if (
          result.service.stopPromise ||
          this.activeServices.get(result.service.session.id) !== result.service
        ) {
          await this.ensureStopped(result.service)
          throw createExpectedAppError(
            'RUN_START_BLOCKED',
            'Run scope changed before the managed service could become active.'
          )
        }
        result.service.allocation.lease.markBound()
        const snapshot = toRunSnapshot(result.service)
        try {
          await this.sessions.recordManagedServiceEndpoint(snapshot.session.id, snapshot.endpoint)
        } catch (error) {
          result.service.reportCleanupFailure(error)
        }
        try {
          command.onEndpointConfirmed?.(snapshot.session, snapshot.endpoint)
        } catch (error) {
          try {
            await this.ensureStopped(result.service)
          } catch (cleanupError) {
            result.service.reportCleanupFailure(cleanupError)
          }
          throw error
        }
        return snapshot
      }

      if (result.inspection === 'unknown') {
        await this.runCleanup(result.service, () => this.quarantineUnverified(result.service))
        throw createExpectedAppError(
          'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED',
          'The local listener could not be proven to belong to this terminal run.',
          createRunAttemptDetails(result.service.session, result.service.allocation.endpoint.port)
        )
      }

      await this.runCleanup(result.service, () => this.releaseMismatchedAttempt(result.service))
      if (intent.policy.type === 'fixed' || attempt === this.maxActivationAttempts - 1) {
        throw createExpectedAppError(
          'SERVICE_LISTENER_OWNERSHIP_MISMATCH',
          'The ready local listener belongs to another process.',
          createRunAttemptDetails(result.service.session, result.service.allocation.endpoint.port)
        )
      }
    }

    throw createExpectedAppError(
      'SERVICE_PORT_ALLOCATION_EXHAUSTED',
      'Unable to activate a local service after bounded attempts.',
      {
        port: 0,
        attemptedProjectId: command.projectId,
        attemptedProjectDirectory: command.projectDirectory,
        attemptedWorkspaceId: command.workspaceId,
        attemptedWorkspaceDirectory: command.workspaceDirectory,
        attemptedGitBranch: command.gitBranch,
        attemptedBlockId: command.blockId,
        attemptedSessionId: null,
        attemptedRunId: runId,
        attemptedGeneration: 0
      }
    )
  }

  async stop(sessionId: string): Promise<void> {
    const service = this.activeServices.get(sessionId)
    if (!service) {
      await this.sessions.terminate(sessionId)
      return
    }

    await this.ensureStopped(service)
  }

  prepareApplicationShutdown(): Promise<void> {
    return this.applicationShutdown.prepare({
      abortInFlightWork: () => this.abortApplicationWork(),
      clearApplicationReferences: () => this.clearApplicationReferences()
    })
  }

  completeApplicationShutdown(): Promise<void> {
    return this.applicationShutdown.complete({
      abortInFlightWork: () => this.abortApplicationWork(),
      clearApplicationReferences: () => this.clearApplicationReferences()
    })
  }

  getActive(sessionId: string): ManagedServiceRunSnapshot | null {
    const service = this.activeServices.get(sessionId)
    return service ? toRunSnapshot(service) : null
  }

  listActive(): readonly ManagedServiceRunSnapshot[] {
    return [...this.activeServices.values()].map(toRunSnapshot)
  }

  async recover(
    evidence: readonly RecoveredManagedServiceEndpoint[]
  ): Promise<readonly ManagedServiceRunSnapshot[]> {
    const recovered: ManagedServiceRunSnapshot[] = []
    for (const candidate of evidence) {
      const session = this.sessions.getSession(candidate.scope.sessionId)
      if (
        !session ||
        session.status !== 'running' ||
        session.processId !== candidate.rootProcessId ||
        session.runId !== candidate.scope.runId ||
        session.generation !== candidate.scope.generation
      ) {
        continue
      }
      const inspection = await this.listenerInspection.inspect({
        host: candidate.endpoint.host,
        port: candidate.endpoint.port,
        rootProcessId: candidate.rootProcessId
      })
      if (inspection.ownership !== 'owned') continue
      let allocation: LocalPortAllocation
      try {
        allocation = this.allocator.adoptBound(session, candidate.endpoint)
      } catch {
        continue
      }
      const service: ActiveManagedService = {
        session,
        allocation,
        readinessController: new AbortController(),
        unregisterLifecycle: () => undefined,
        unregisterManagedTerminator: () => undefined,
        stopPromise: null,
        reportCleanupFailure: () => undefined,
        reportPortState: () => undefined
      }
      this.activeServices.set(session.id, service)
      service.unregisterManagedTerminator = this.sessions.registerManagedTerminator(
        session.id,
        () => this.ensureStopped(service)
      )
      service.unregisterLifecycle = this.lifecycle.track(session, () => this.ensureStopped(service))
      recovered.push(toRunSnapshot(service))
    }
    return recovered
  }

  private async activateAttempt(
    command: LaunchManagedServiceCommand,
    intent: ServicePortIntent,
    runId: string
  ): Promise<{
    readonly service: ActiveManagedService
    readonly inspection: 'owned' | 'external' | 'unknown'
  }> {
    const attemptState: {
      allocation?: LocalPortAllocation
      service?: ActiveManagedService
    } = {}
    let outputTail = ''
    let resolveOutput: () => void = () => undefined
    const outputReady = new Promise<void>((resolve) => {
      resolveOutput = resolve
    })
    let rejectExit: (error: unknown) => void = () => undefined
    const exitedBeforeReady = new Promise<never>((_, reject) => {
      rejectExit = reject
    })
    const readinessController = linkAbortSignal(command.signal)
    this.activationControllers.add(readinessController)
    const timeoutId = setTimeout(
      () =>
        readinessController.abort(
          createExpectedAppError('COMMAND_TIMED_OUT', 'Managed service readiness timed out.')
        ),
      command.readinessTimeoutMs
    )

    let session: TerminalSessionSnapshot
    try {
      session = await this.sessions.start({
        projectId: command.projectId,
        projectDirectory: command.projectDirectory,
        workspaceId: command.workspaceId,
        workspaceDirectory: command.workspaceDirectory,
        gitBranch: command.gitBranch,
        terminalBlockId: command.blockId,
        workingDirectory: command.workingDirectory,
        terminalSourceTheme: command.terminalSourceTheme,
        launchCommand: command.launchCommand,
        environment: command.environment,
        shell: command.shell,
        columns: command.columns,
        rows: command.rows,
        runId,
        sessionKind: 'direct',
        trackLifecycle: false,
        prepareLaunch: async (scope) => {
          const allocation = await this.allocator.allocate({
            scope,
            intent,
            signal: readinessController.signal
          })
          attemptState.allocation = allocation
          const bound = applyServicePortBinding({
            launchCommand: command.launchCommand,
            environment: command.environment,
            port: allocation.endpoint.port,
            binding: intent.binding
          })
          await releaseReservationForActivation(allocation)
          return bound
        },
        onOutput: (event) => {
          command.onOutput(event)
          if (command.readiness.type === 'output') {
            const combined = `${outputTail}${event.data}`
            if (combined.includes(command.readiness.text)) {
              resolveOutput()
            } else {
              outputTail = combined.slice(Math.min(0, 1 - command.readiness.text.length))
            }
          }
        },
        onExit: (event) => {
          rejectExit(
            createExpectedAppError(
              'UNEXPECTED_ERROR',
              'Managed service exited before becoming ready.'
            )
          )
          command.onExit(event)
          const service = attemptState.service
          if (service && !this.shouldDelegateToProvider(service)) {
            void this.ensureStopped(service).catch(service.reportCleanupFailure)
          }
        },
        onStartedWithinGate: (startedSession) => {
          const allocation = attemptState.allocation
          if (!allocation) {
            throw createExpectedAppError(
              'SERVICE_PORT_ALLOCATION_EXHAUSTED',
              'Managed service did not receive a local port allocation.'
            )
          }
          const activeService: ActiveManagedService = {
            session: startedSession,
            allocation,
            readinessController,
            unregisterLifecycle: () => undefined,
            unregisterManagedTerminator: () => undefined,
            stopPromise: null,
            reportCleanupFailure: (error) => command.onCleanupFailed?.(error),
            reportPortState: (state) =>
              command.onPortStateChanged?.(startedSession, allocation.endpoint, state)
          }
          this.activeServices.set(startedSession.id, activeService)
          activeService.unregisterManagedTerminator = this.sessions.registerManagedTerminator(
            startedSession.id,
            () => this.ensureStopped(activeService)
          )
          activeService.unregisterLifecycle = this.lifecycle.track(startedSession, () =>
            this.ensureStopped(activeService)
          )
          attemptState.service = activeService
        }
      })
    } catch (error) {
      clearTimeout(timeoutId)
      this.activationControllers.delete(readinessController)
      await releaseUnusedAllocation(attemptState.allocation ?? null)
      throw error
    }

    const allocation = attemptState.allocation
    if (!allocation) {
      clearTimeout(timeoutId)
      this.activationControllers.delete(readinessController)
      throw createExpectedAppError(
        'SERVICE_PORT_ALLOCATION_EXHAUSTED',
        'Managed service did not receive a local port allocation.'
      )
    }
    if (session.status !== 'running' || session.processId === null) {
      clearTimeout(timeoutId)
      this.activationControllers.delete(readinessController)
      await releaseUnusedAllocation(allocation)
      throw createExpectedAppError(
        'UNEXPECTED_ERROR',
        session.failureReason ?? 'Managed service process failed to start.'
      )
    }
    const service = attemptState.service
    if (!service || this.activeServices.get(session.id) !== service) {
      clearTimeout(timeoutId)
      this.activationControllers.delete(readinessController)
      await this.sessions.terminateProcess(session.id)
      await releaseUnusedAllocation(allocation)
      throw createExpectedAppError(
        'RUN_START_BLOCKED',
        'Run scope changed before the managed service could become active.'
      )
    }
    try {
      command.onSessionStarted(session)
      const tcpReady = this.readiness.waitUntilReady({
        host: allocation.endpoint.host,
        port: allocation.endpoint.port,
        signal: readinessController.signal
      })
      const readinessPromise =
        command.readiness.type === 'tcp'
          ? tcpReady
          : Promise.all([waitForOutput(outputReady, readinessController.signal), tcpReady]).then(
              () => undefined
            )
      await Promise.race([readinessPromise, exitedBeforeReady])

      const inspection = await Promise.race([
        this.listenerInspection.inspect({
          host: allocation.endpoint.host,
          port: allocation.endpoint.port,
          rootProcessId: session.processId
        }),
        exitedBeforeReady
      ])
      return { service, inspection: inspection.ownership }
    } catch (error) {
      if (!this.shouldDelegateToProvider(service)) {
        try {
          await this.ensureStopped(service)
        } catch (cleanupError) {
          service.reportCleanupFailure(cleanupError)
        }
      }
      throw this.applicationShutdown.isShuttingDown
        ? this.applicationShutdown.createBlockedError()
        : error
    } finally {
      clearTimeout(timeoutId)
      this.activationControllers.delete(readinessController)
    }
  }

  private ensureStopped(service: ActiveManagedService): Promise<void> {
    return this.runCleanup(service, () => this.stopAndRelease(service))
  }

  private runCleanup(service: ActiveManagedService, cleanup: () => Promise<void>): Promise<void> {
    service.stopPromise ??= cleanup()
    return service.stopPromise
  }

  private async stopAndRelease(service: ActiveManagedService): Promise<void> {
    service.readinessController.abort()
    markReleasing(service.allocation.lease)
    this.reportPortState(service, 'releasing')

    try {
      await this.sessions.terminateProcess(service.session.id)
      await waitWithTimeout(
        (signal) =>
          this.readiness.waitUntilClosed({
            host: service.allocation.endpoint.host,
            port: service.allocation.endpoint.port,
            signal
          }),
        this.cleanupTimeoutMs
      )
      service.allocation.lease.release()
      this.reportPortState(service, 'released')
      this.removeActive(service)
    } catch (error) {
      quarantineIfReleasing(service.allocation.lease, getErrorMessage(error))
      this.reportPortState(service, 'quarantined')
      this.removeActive(service)
      throw createExpectedAppError(
        'SERVICE_PORT_CLEANUP_FAILED',
        'The managed service listener did not close after its terminal process exited.',
        createRunAttemptDetails(service.session, service.allocation.endpoint.port)
      )
    }
  }

  private async releaseMismatchedAttempt(service: ActiveManagedService): Promise<void> {
    service.readinessController.abort()
    markReleasing(service.allocation.lease)
    this.reportPortState(service, 'releasing')
    try {
      await this.sessions.terminateProcess(service.session.id)
      service.allocation.lease.release()
      this.reportPortState(service, 'released')
    } catch (error) {
      quarantineIfReleasing(service.allocation.lease, getErrorMessage(error))
      this.reportPortState(service, 'quarantined')
      throw error
    } finally {
      this.removeActive(service)
    }
  }

  private async quarantineUnverified(service: ActiveManagedService): Promise<void> {
    service.readinessController.abort()
    markReleasing(service.allocation.lease)
    this.reportPortState(service, 'releasing')
    try {
      await this.sessions.terminateProcess(service.session.id)
    } finally {
      quarantineIfReleasing(
        service.allocation.lease,
        'Listener ownership could not be verified during cleanup.'
      )
      this.reportPortState(service, 'quarantined')
      this.removeActive(service)
    }
  }

  private removeActive(service: ActiveManagedService): void {
    if (this.activeServices.get(service.session.id) === service) {
      this.activeServices.delete(service.session.id)
    }
    service.unregisterManagedTerminator()
    service.unregisterLifecycle()
  }

  private reportPortState(
    service: ActiveManagedService,
    state: 'releasing' | 'released' | 'quarantined'
  ): void {
    try {
      service.reportPortState(state)
    } catch (error) {
      service.reportCleanupFailure(error)
    }
  }

  private shouldDelegateToProvider(service: ActiveManagedService): boolean {
    return this.applicationShutdown.isShuttingDown && !service.stopPromise
  }

  private abortApplicationWork(): void {
    const reason = this.applicationShutdown.createBlockedError()
    for (const controller of this.activationControllers) controller.abort(reason)
    for (const service of this.activeServices.values()) {
      service.readinessController.abort(reason)
    }
  }

  private clearApplicationReferences(): void {
    for (const service of [...this.activeServices.values()]) this.removeActive(service)
    this.activationControllers.clear()
    this.allocator.clearApplicationReferences()
  }
}

function toRunSnapshot(service: ActiveManagedService): ManagedServiceRunSnapshot {
  return {
    scope: service.session,
    session: service.session,
    endpoint: service.allocation.endpoint,
    lease: service.allocation.lease.toSnapshot()
  }
}
