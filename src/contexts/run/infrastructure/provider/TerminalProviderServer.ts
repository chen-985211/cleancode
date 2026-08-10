import { chmod, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalModelRecoveryPort } from '../../application/ports/TerminalModelPort'
import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import {
  isSameTerminalRun,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import {
  FileTerminalRecoveryStore,
  type TerminalRecoveryLoadIssue
} from '../persistence/FileTerminalRecoveryStore'
import { HeadlessTerminalModelAdapter } from '../terminal-model/HeadlessTerminalModelAdapter'
import { NodePtyTerminalProcessAdapter } from '../pty/NodePtyTerminalProcessAdapter'
import {
  type TerminalProviderEvent,
  terminalProviderMaxOutputChunkBytes,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  createProviderSessionSnapshot,
  getErrorMessage,
  sendTerminalProviderMessage,
  splitUtf8
} from './TerminalProviderServerSupport'
import { launchTerminalProviderForegroundJob } from './TerminalProviderForegroundJob'
import { TerminalProviderSessionPersistence } from './TerminalProviderSessionPersistence'
import { TerminalProviderControllerLifecycle } from './TerminalProviderControllerLifecycle'
import { TerminalProviderShutdownCoordinator } from './TerminalProviderShutdownCoordinator'
import {
  attachTerminalProviderSocket,
  withTerminalProviderOperationDeadline
} from './TerminalProviderSocketHandler'
import {
  countLiveProviderSessions,
  hasLiveProviderSessions,
  type ProviderTerminalSession,
  type TerminalProviderRequestParams
} from './TerminalProviderServerTypes'

const maxRetainedLiveSessions = 32
const providerCloseCheckpointDeadlineMs = 750

export interface TerminalProviderServerOptions {
  readonly endpoint: string
  readonly authToken: string
  readonly instanceId: string
  readonly recoveryDirectory: string
  readonly processes?: TerminalProcessPort
  readonly models?: TerminalModelRecoveryPort
  readonly store?: FileTerminalRecoveryStore
  readonly outputPersistenceBatchWindowMs?: number
  readonly shutdownConcurrency?: number
  readonly onExitRequested?: () => void
  readonly onInitialStateListed?: () => void
  readonly log?: (message: string, details?: Readonly<Record<string, unknown>>) => void
}

export class TerminalProviderServer {
  private readonly processes: TerminalProcessPort
  private readonly models: TerminalModelRecoveryPort
  private readonly store: FileTerminalRecoveryStore
  private readonly shutdownCoordinator: TerminalProviderShutdownCoordinator
  private readonly controllerLifecycle: TerminalProviderControllerLifecycle
  private readonly sessions = new Map<string, ProviderTerminalSession>()
  private readonly modelIdentities = new Map<string, TerminalRunScope>()
  private readonly recoveryIssues: TerminalRecoveryLoadIssue[] = []
  private readonly sockets = new Set<Socket>()
  private server: Server | null = null
  private exitTimer: ReturnType<typeof setTimeout> | null = null
  private isClosing = false
  private closePromise: Promise<void> | null = null
  private hasListedInitialState = false

  constructor(private readonly options: TerminalProviderServerOptions) {
    this.processes = options.processes ?? new NodePtyTerminalProcessAdapter()
    this.models = options.models ?? new HeadlessTerminalModelAdapter()
    this.store =
      options.store ?? new FileTerminalRecoveryStore({ rootDirectory: options.recoveryDirectory })
    this.shutdownCoordinator = new TerminalProviderShutdownCoordinator({
      concurrency: options.shutdownConcurrency,
      processes: this.processes,
      retireSession: (identity) => this.retireSession(identity),
      onFailure: (error, session, phase) => {
        if (phase === 'checkpoint') {
          this.recordPersistenceFailure(error, session)
          return
        }
        const current = this.sessions.get(session.snapshot.sessionId)
        if (current && isSameTerminalRun(current.snapshot, session.snapshot)) {
          current.quarantined = true
        }
        this.log('shutdown-session-failed', {
          message: getErrorMessage(error),
          sessionId: session.snapshot.sessionId
        })
      }
    })
    this.controllerLifecycle = new TerminalProviderControllerLifecycle({
      createRelease: (releaseId) => {
        const sessions = [...this.sessions.values()]
        return Promise.resolve().then(() =>
          this.shutdownCoordinator.release({ releaseId, sessions })
        )
      },
      hasLiveSessions: () => hasLiveProviderSessions(this.sessions.values()),
      isProcessAlive: isControllerProcessAlive,
      log: (message, details) => this.log(message, details),
      onClaim: () => this.prepareControllerClaim(),
      onIdleWithoutLiveSessions: () => this.scheduleExit()
    })
  }

  async start(): Promise<void> {
    await this.restoreColdHistory()
    if (process.platform !== 'win32') {
      await rm(this.options.endpoint, { force: true })
    }
    await new Promise<void>((resolve, reject) => {
      const server = createServer((socket) => this.acceptSocket(socket))
      this.server = server
      server.once('error', reject)
      server.listen(this.options.endpoint, () => {
        server.off('error', reject)
        resolve()
      })
    })
    if (process.platform !== 'win32') {
      await chmod(this.options.endpoint, 0o600)
    }
    this.log('provider-ready', { instanceId: this.options.instanceId })
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.isClosing = true
    this.closePromise = Promise.resolve().then(() => this.performClose())
    return this.closePromise
  }

  private async performClose(): Promise<void> {
    if (this.exitTimer) clearTimeout(this.exitTimer)
    this.exitTimer = null
    await Promise.allSettled(
      [...this.sessions.values()].map((session) =>
        withTerminalProviderOperationDeadline(
          session.persistence.checkpoint(true),
          providerCloseCheckpointDeadlineMs
        ).catch((error) =>
          this.log('checkpoint-failed', {
            message: getErrorMessage(error),
            sessionId: session.snapshot.sessionId
          })
        )
      )
    )
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
    if (process.platform !== 'win32') {
      await rm(this.options.endpoint, { force: true })
    }
  }

  private acceptSocket(socket: Socket): void {
    this.sockets.add(socket)
    attachTerminalProviderSocket({
      authToken: this.options.authToken,
      dispatch: (method, params, activeSocket) => this.dispatch(method, params, activeSocket),
      getControllerState: () => this.controllerLifecycle.state,
      log: (message, details) => this.log(message, details),
      onClose: (detachedCleanly) => {
        this.sockets.delete(socket)
        if (this.isClosing || detachedCleanly) return
        this.controllerLifecycle.handleSocketClose(socket)
      },
      socket
    })
  }

  private async dispatch(method: string, params: unknown, socket: Socket): Promise<unknown> {
    const input = (params ?? {}) as TerminalProviderRequestParams
    switch (method) {
      case 'health':
        return {
          instanceId: this.options.instanceId,
          protocolVersion: terminalProviderProtocolVersion,
          processId: process.pid,
          controllerState: this.controllerLifecycle.state.kind
        }
      case 'claimController':
        return this.controllerLifecycle.claim(socket, input.controllerId, input.processId)
      case 'listSessions': {
        const result = {
          sessions: [...this.sessions.values()]
            .filter(({ quarantined, snapshot }) => !quarantined && snapshot.status !== 'idle')
            .map(({ snapshot }) => snapshot),
          issues: this.recoveryIssues,
          managedServiceEndpoints: [...this.sessions.values()].flatMap((session) =>
            session.managedServiceEndpoint &&
            !session.quarantined &&
            session.snapshot.status === 'running' &&
            session.snapshot.processId !== null
              ? [
                  {
                    scope: session.snapshot,
                    endpoint: session.managedServiceEndpoint,
                    rootProcessId: session.snapshot.processId
                  }
                ]
              : []
          )
        }
        this.notifyInitialStateListed()
        return result
      }
      case 'createModel': {
        const identity = input.command.identity
        const existingIdentity = this.modelIdentities.get(identity.sessionId)
        if (existingIdentity) {
          if (isSameTerminalRun(existingIdentity, identity)) return null
          throw createExpectedAppError('RUN_SCOPE_STALE', 'Terminal model identity is stale.')
        }
        this.models.create({
          ...input.command,
          onQueryResponse: (response) => {
            const sessionId = input.command.identity.sessionId
            if (this.sessions.get(sessionId)?.snapshot.status === 'running') {
              this.processes.write(sessionId, response)
            }
          },
          onFlowControlChange: (isPaused) => {
            const sessionId = input.command.identity.sessionId
            if (this.sessions.get(sessionId)?.snapshot.status !== 'running') return
            if (isPaused) this.processes.pauseOutput(sessionId)
            else this.processes.resumeOutput(sessionId)
          },
          onTitleChanged: (title) => {
            this.broadcast({
              type: 'event',
              event: 'terminal-title',
              payload: {
                scope: input.command.identity,
                sessionId: input.command.identity.sessionId,
                title
              }
            })
          }
        })
        this.modelIdentities.set(identity.sessionId, identity)
        return null
      }
      case 'startProcess':
        return this.startProcess(input.command)
      case 'launchForegroundJob':
        return launchTerminalProviderForegroundJob({
          command: input.foregroundJob,
          processes: this.processes,
          sessions: this.sessions,
          broadcast: (event) => this.broadcast(event)
        })
      case 'write':
        this.processes.write(input.sessionId, input.input)
        return null
      case 'resizeProcess':
        this.processes.resize(input.sessionId, input.columns, input.rows)
        return null
      case 'pauseOutput':
        this.processes.pauseOutput(input.sessionId)
        return null
      case 'resumeOutput':
        this.processes.resumeOutput(input.sessionId)
        return null
      case 'readWorkingDirectory':
        return this.processes.readWorkingDirectory(input.sessionId)
      case 'stopProcess':
        await this.processes.stop(input.sessionId)
        return null
      case 'disposeProcesses':
        await this.processes.disposeAll()
        return null
      case 'attachView':
        return this.models.attachView({
          identity: input.identity,
          viewId: input.viewId,
          onOutput: () => undefined
        })
      case 'detachView':
        await this.models.detachView(input.identity, input.viewId)
        return null
      case 'flushModel':
        await this.models.flush(input.identity)
        return null
      case 'resizeModel':
        this.models.resize(input.identity, input.columns, input.rows)
        return null
      case 'setScrollbackRows':
        this.models.setScrollbackRows(input.rows)
        return null
      case 'updateWorkingDirectory':
        this.models.updateWorkingDirectory(input.identity, input.workingDirectory)
        return null
      case 'retireModel':
        await this.retireSession(input.identity)
        return null
      case 'disposeModels':
        this.models.disposeAll()
        this.modelIdentities.clear()
        return null
      case 'getDiagnostics':
        return this.models.getDiagnostics()
      case 'setRetention':
        await this.setRetention(input.sessionId, input.retentionPolicy)
        return null
      case 'recordManagedServiceEndpoint':
        await this.recordManagedServiceEndpoint(input.sessionId, input.endpoint)
        return null
      case 'beginApplicationDetach': {
        const release = this.controllerLifecycle.beginRelease('application-detach')
        if (!release) {
          throw createExpectedAppError(
            'TERMINAL_PROVIDER_UNAVAILABLE',
            'Terminal provider controller release is unavailable.'
          )
        }
        return { releaseId: release.releaseId }
      }
      case 'awaitApplicationDetach':
        return this.controllerLifecycle.awaitRelease(socket, input.releaseId)
      case 'detachApplication':
        await this.controllerLifecycle.releaseController('application-detach')
        return null
      default:
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
          'Terminal provider method is unsupported.'
        )
    }
  }

  private async startProcess(
    command: Omit<StartTerminalProcessCommand, 'onOutput' | 'onExit'>
  ): Promise<{ readonly processId: number }> {
    const existing = this.sessions.get(command.scope.sessionId)
    if (existing) {
      if (existing.quarantined) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_CONTROLLER_BUSY',
          'Terminal session is quarantined after an incomplete controller release.'
        )
      }
      if (
        isSameTerminalRun(existing.snapshot, command.scope) &&
        existing.snapshot.status === 'running' &&
        existing.snapshot.processId !== null
      ) {
        return { processId: existing.snapshot.processId }
      }
      if (isSameTerminalRun(existing.snapshot, command.scope) && existing.starting) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_CONTROLLER_BUSY',
          'Terminal session is still starting.',
          { retryAfterMs: 50 }
        )
      }
      throw createExpectedAppError('RUN_SCOPE_STALE', 'Terminal session identity is stale.')
    }
    if (countLiveProviderSessions(this.sessions.values()) >= maxRetainedLiveSessions) {
      throw createExpectedAppError(
        'TERMINAL_RECOVERY_STORAGE_LIMIT',
        'Terminal provider live-session limit was exceeded.'
      )
    }
    const session = this.createProviderSession(createProviderSessionSnapshot(command))
    this.sessions.set(command.scope.sessionId, session)
    try {
      await session.persistence.checkpoint(true)
      if (session.retired) throw providerSessionRetiredDuringStart()
      const handle = await this.processes.start({
        ...command,
        onOutput: (event) => this.acceptProcessOutput(session, event.data),
        onExit: (event) => void this.handleProcessExit(session, event.exitCode)
      })
      session.starting = false
      if (session.retired || this.sessions.get(command.scope.sessionId) !== session) {
        await this.processes.stop(command.scope.sessionId).catch(() => undefined)
        throw providerSessionRetiredDuringStart()
      }
      if (session.snapshot.status === 'idle') {
        session.snapshot = {
          ...session.snapshot,
          processId: handle.processId,
          status: 'running'
        }
        await session.persistence.checkpoint(true)
      }
      return handle
    } catch (error) {
      session.starting = false
      await this.retireSession(command.scope)
      throw error
    }
  }

  private acceptProcessOutput(session: ProviderTerminalSession, data: string): void {
    if (
      session.retired ||
      (session.snapshot.status !== 'idle' && session.snapshot.status !== 'running')
    ) {
      return
    }
    for (const chunk of splitUtf8(data, terminalProviderMaxOutputChunkBytes)) {
      const output = this.models.acceptOutput(session.snapshot, chunk)
      this.broadcast({
        type: 'event',
        event: 'terminal-output',
        payload: {
          scope: session.snapshot,
          sessionId: session.snapshot.sessionId,
          data: output.data,
          sequence: output.sequence
        }
      })
      session.persistence.appendOutput(output)
    }
  }

  private async handleProcessExit(
    session: ProviderTerminalSession,
    exitCode: number | null
  ): Promise<void> {
    if (session.retired) return
    session.snapshot = {
      ...session.snapshot,
      processId: null,
      status: 'exited',
      exitCode,
      recoveryKind: 'ended'
    }
    await session.persistence
      .checkpoint(true)
      .catch((error) => this.recordPersistenceFailure(error, session))
    if (session.retired) return
    this.broadcast({
      type: 'event',
      event: 'terminal-exit',
      payload: {
        scope: session.snapshot,
        sessionId: session.snapshot.sessionId,
        exitCode
      }
    })
  }

  private async setRetention(
    sessionId: string,
    retentionPolicy: TerminalRetentionPolicy
  ): Promise<void> {
    const session = this.requireSession(sessionId)
    if (session.snapshot.kind === 'workflow' && retentionPolicy === 'keep-after-application-exit') {
      throw createExpectedAppError(
        'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
        'Workflow terminal sessions cannot survive application exit.'
      )
    }
    const previousRetentionPolicy = session.snapshot.retentionPolicy
    session.snapshot = { ...session.snapshot, retentionPolicy }
    try {
      await session.persistence.checkpoint(true)
    } catch (error) {
      session.snapshot = { ...session.snapshot, retentionPolicy: previousRetentionPolicy }
      throw error
    }
  }

  private async recordManagedServiceEndpoint(
    sessionId: string,
    endpoint: ActualServiceEndpoint
  ): Promise<void> {
    const session = this.requireSession(sessionId)
    if (session.snapshot.status !== 'running' || session.snapshot.kind !== 'direct') return
    session.managedServiceEndpoint = endpoint
    await session.persistence.checkpoint(true)
  }

  private prepareControllerClaim(): void {
    if (this.exitTimer) clearTimeout(this.exitTimer)
    this.exitTimer = null
    for (const session of this.sessions.values()) {
      if (session.snapshot.status === 'running') {
        session.snapshot = { ...session.snapshot, recoveryKind: 'warm' }
      }
    }
  }

  private async retireSession(identity: TerminalRunScope): Promise<void> {
    const session = this.sessions.get(identity.sessionId)
    const exactSession = session && isSameTerminalRun(session.snapshot, identity) ? session : null
    if (exactSession) exactSession.retired = true
    const modelIdentity = this.modelIdentities.get(identity.sessionId)
    if (modelIdentity && isSameTerminalRun(modelIdentity, identity)) {
      this.models.retire(identity)
      this.modelIdentities.delete(identity.sessionId)
    }
    if (!exactSession) return
    await exactSession.persistence.retire()
    this.sessions.delete(identity.sessionId)
    await this.store.delete(identity)
  }

  private async restoreColdHistory(): Promise<void> {
    const prunedIssues = await this.store.pruneColdHistory()
    const loaded = await this.store.load()
    this.recoveryIssues.push(...prunedIssues, ...loaded.issues)
    this.log('recovery-loaded', {
      issueCount: prunedIssues.length + loaded.issues.length,
      sessionCount: loaded.sessions.length
    })
    for (const bundle of loaded.sessions) {
      if (
        bundle.checkpoint.session.kind === 'workflow' ||
        bundle.checkpoint.session.retentionPolicy !== 'keep-after-application-exit'
      ) {
        await this.store.delete(bundle.checkpoint.session)
        continue
      }
      const exactCheckpoint = bundle.checkpoint.model
      await this.models.restoreCheckpoint({
        checkpoint: exactCheckpoint,
        terminalSourceTheme: bundle.checkpoint.session.terminalSourceTheme,
        onQueryResponse: () => undefined,
        onFlowControlChange: () => undefined
      })
      this.modelIdentities.set(exactCheckpoint.identity.sessionId, exactCheckpoint.identity)
      for (const output of bundle.output) {
        this.models.acceptOutput(exactCheckpoint.identity, output.data)
      }
      const latest = await this.models.captureCheckpoint(exactCheckpoint.identity)
      this.models.retire(exactCheckpoint.identity)
      const historicalCheckpoint = {
        ...latest,
        content: latest.normalContent
      }
      await this.models.restoreCheckpoint({
        checkpoint: historicalCheckpoint,
        terminalSourceTheme: bundle.checkpoint.session.terminalSourceTheme,
        onQueryResponse: () => undefined,
        onFlowControlChange: () => undefined
      })
      const snapshot: TerminalSessionSnapshot = {
        ...bundle.checkpoint.session,
        processId: null,
        status: 'exited',
        recoveryKind: 'historical'
      }
      const session = this.createProviderSession(snapshot)
      this.sessions.set(snapshot.sessionId, session)
      await session.persistence.replaceCheckpoint(historicalCheckpoint, true)
    }
  }

  private createProviderSession(snapshot: TerminalSessionSnapshot): ProviderTerminalSession {
    const sessionState: Omit<ProviderTerminalSession, 'persistence'> = {
      snapshot,
      managedServiceEndpoint: undefined,
      quarantined: false,
      retired: false,
      starting: snapshot.status === 'idle'
    }
    const persistence = new TerminalProviderSessionPersistence({
      batchWindowMs: this.options.outputPersistenceBatchWindowMs,
      captureCheckpoint: () => this.models.captureCheckpoint(sessionState.snapshot),
      getSession: () => sessionState.snapshot,
      instanceId: this.options.instanceId,
      isRetired: () => sessionState.retired,
      onBackgroundError: (error) => this.recordPersistenceFailure(error, sessionState),
      store: this.store
    })
    return Object.assign(sessionState, { persistence })
  }

  private recordPersistenceFailure(
    error: unknown,
    session?: Pick<ProviderTerminalSession, 'snapshot'>
  ): void {
    if (session?.snapshot.retentionPolicy === 'keep-after-application-exit') {
      session.snapshot = {
        ...session.snapshot,
        retentionPolicy: 'terminate-on-application-exit'
      }
    }
    this.log('persistence-failed', { message: getErrorMessage(error) })
    this.broadcast({
      type: 'event',
      event: 'recovery-issue',
      payload: {
        reason: 'storage-unavailable',
        sessionId: session?.snapshot.sessionId ?? null
      }
    })
  }

  private requireSession(sessionId: string): ProviderTerminalSession {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw createExpectedAppError('TERMINAL_SESSION_NOT_FOUND', 'Terminal session was not found.')
    }
    if (session.quarantined) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_UNAVAILABLE',
        'Terminal session is quarantined after an incomplete controller release.'
      )
    }
    return session
  }

  private scheduleExit(): void {
    if (this.exitTimer) return
    this.exitTimer = setTimeout(() => {
      this.exitTimer = null
      if (
        this.controllerLifecycle.state.kind !== 'unclaimed' ||
        hasLiveProviderSessions(this.sessions.values())
      ) {
        return
      }
      void this.close().finally(() => this.options.onExitRequested?.())
    }, 50)
  }

  private notifyInitialStateListed(): void {
    if (this.hasListedInitialState) return
    this.hasListedInitialState = true
    try {
      this.options.onInitialStateListed?.()
    } catch (error) {
      this.log('initial-state-listener-failed', { message: getErrorMessage(error) })
    }
  }

  private broadcast(event: TerminalProviderEvent): void {
    const controller = this.controllerLifecycle.state
    if (controller.kind !== 'active' || controller.socket.destroyed) return
    sendTerminalProviderMessage(controller.socket, event)
  }

  private log(message: string, details: Readonly<Record<string, unknown>> = {}): void {
    this.options.log?.(message, details)
  }
}

function isControllerProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
  }
}

function providerSessionRetiredDuringStart() {
  return createExpectedAppError(
    'TERMINAL_PROVIDER_UNAVAILABLE',
    'Terminal session was retired while its process was starting.'
  )
}
