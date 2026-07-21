import { chmod, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import type { TerminalModelRecoveryPort } from '../../application/ports/TerminalModelPort'
import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import { isSameTerminalRun } from '../../domain/value-objects/TerminalRunScope'
import {
  FileTerminalRecoveryStore,
  type TerminalRecoveryLoadIssue,
  type TerminalRecoveryRecord
} from '../persistence/FileTerminalRecoveryStore'
import { HeadlessTerminalModelAdapter } from '../terminal-model/HeadlessTerminalModelAdapter'
import { NodePtyTerminalProcessAdapter } from '../pty/NodePtyTerminalProcessAdapter'
import {
  encodeTerminalProviderFrame,
  type TerminalProviderEvent,
  TerminalProviderFrameDecoder,
  type TerminalProviderRequest,
  type TerminalProviderResponse,
  terminalProviderMaxOutputChunkBytes,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import {
  createExpectedAppError,
  createUnexpectedAppError,
  isAppError,
  serializeAppError
} from '../../../../shared-kernel/application/errors/AppError'
import {
  createProviderSessionSnapshot,
  getErrorMessage,
  isTerminalProviderRequest,
  matchesAuthToken,
  splitUtf8
} from './TerminalProviderServerSupport'

const checkpointIntervalMs = 2_000
const maxRetainedLiveSessions = 32

export interface TerminalProviderServerOptions {
  readonly endpoint: string
  readonly authToken: string
  readonly instanceId: string
  readonly recoveryDirectory: string
  readonly processes?: TerminalProcessPort
  readonly models?: TerminalModelRecoveryPort
  readonly store?: FileTerminalRecoveryStore
  readonly onExitRequested?: () => void
  readonly log?: (message: string, details?: Readonly<Record<string, unknown>>) => void
}

export class TerminalProviderServer {
  private readonly processes: TerminalProcessPort
  private readonly models: TerminalModelRecoveryPort
  private readonly store: FileTerminalRecoveryStore
  private readonly sessions = new Map<string, ProviderTerminalSession>()
  private readonly recoveryIssues: TerminalRecoveryLoadIssue[] = []
  private readonly sockets = new Set<Socket>()
  private server: Server | null = null
  private controller: Socket | null = null
  private isClosing = false

  constructor(private readonly options: TerminalProviderServerOptions) {
    this.processes = options.processes ?? new NodePtyTerminalProcessAdapter()
    this.models = options.models ?? new HeadlessTerminalModelAdapter()
    this.store =
      options.store ?? new FileTerminalRecoveryStore({ rootDirectory: options.recoveryDirectory })
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

  async close(): Promise<void> {
    if (this.isClosing) return
    this.isClosing = true
    for (const session of this.sessions.values()) {
      if (session.checkpointTimer) clearTimeout(session.checkpointTimer)
      await this.queueCheckpoint(session, true).catch((error) =>
        this.log('checkpoint-failed', { message: getErrorMessage(error) })
      )
    }
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
    const decoder = new TerminalProviderFrameDecoder()
    let detachedCleanly = false
    let requestTail = Promise.resolve()
    this.sockets.add(socket)
    socket.on('data', (chunk) => {
      try {
        for (const message of decoder.push(chunk)) {
          requestTail = requestTail
            .then(async () => {
              detachedCleanly ||= await this.handleRequest(socket, message)
            })
            .catch((error) => {
              this.log('protocol-error', { message: getErrorMessage(error) })
              socket.destroy()
            })
        }
      } catch (error) {
        this.log('protocol-error', { message: getErrorMessage(error) })
        socket.destroy()
      }
    })
    socket.on('close', () => {
      this.sockets.delete(socket)
      if (this.controller !== socket) return
      this.controller = null
      if (!detachedCleanly && !this.isClosing) void this.handleUnexpectedControllerDisconnect()
    })
    socket.on('error', (error) => this.log('socket-error', { message: error.message }))
  }

  private async handleRequest(socket: Socket, value: unknown): Promise<boolean> {
    if (!isTerminalProviderRequest(value)) {
      socket.destroy()
      return false
    }
    const request = value
    try {
      this.authenticate(socket, request)
      const result = await this.dispatch(request.method, request.params, socket)
      this.send(socket, { type: 'response', requestId: request.requestId, ok: true, result })
      if (request.method === 'detachApplication') {
        setTimeout(() => socket.end(), 0)
        return true
      }
    } catch (error) {
      const appError = isAppError(error) ? error : createUnexpectedAppError(getErrorMessage(error))
      this.send(socket, {
        type: 'response',
        requestId: request.requestId,
        ok: false,
        error: serializeAppError(appError)
      })
    }
    return false
  }

  private authenticate(socket: Socket, request: TerminalProviderRequest): void {
    if (request.protocolVersion !== terminalProviderProtocolVersion) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
        'Terminal provider protocol version is unsupported.'
      )
    }
    if (!matchesAuthToken(request.authToken, this.options.authToken)) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_AUTHENTICATION_FAILED',
        'Terminal provider authentication failed.'
      )
    }
    if (this.controller && this.controller !== socket && request.method !== 'health') {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_UNAVAILABLE',
        'Terminal provider already has an application controller.'
      )
    }
    if (!this.controller) this.controller = socket
  }

  private async dispatch(method: string, params: unknown, socket: Socket): Promise<unknown> {
    const input = (params ?? {}) as TerminalProviderRequestParams
    switch (method) {
      case 'health':
        for (const session of this.sessions.values()) {
          if (session.snapshot.status === 'running') {
            session.snapshot = { ...session.snapshot, recoveryKind: 'warm' }
          }
        }
        return {
          instanceId: this.options.instanceId,
          protocolVersion: terminalProviderProtocolVersion,
          processId: process.pid,
          isController: this.controller === socket
        }
      case 'listSessions':
        return {
          sessions: [...this.sessions.values()].map(({ snapshot }) => snapshot),
          issues: this.recoveryIssues,
          managedServiceEndpoints: [...this.sessions.values()].flatMap((session) =>
            session.managedServiceEndpoint &&
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
      case 'createModel':
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
          }
        })
        return null
      case 'startProcess':
        return this.startProcess(input.command)
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
        return null
      case 'getDiagnostics':
        return this.models.getDiagnostics()
      case 'setRetention':
        await this.setRetention(input.sessionId, input.retentionPolicy)
        return null
      case 'recordManagedServiceEndpoint':
        await this.recordManagedServiceEndpoint(input.sessionId, input.endpoint)
        return null
      case 'detachApplication':
        await this.detachApplication()
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
    if (this.liveSessionCount() >= maxRetainedLiveSessions) {
      throw createExpectedAppError(
        'TERMINAL_RECOVERY_STORAGE_LIMIT',
        'Terminal provider live-session limit was exceeded.'
      )
    }
    const session: ProviderTerminalSession = {
      snapshot: createProviderSessionSnapshot(command),
      checkpointTimer: null,
      persistenceTail: Promise.resolve(),
      managedServiceEndpoint: undefined,
      retired: false
    }
    this.sessions.set(command.scope.sessionId, session)
    try {
      await this.queueCheckpoint(session, true)
      const handle = await this.processes.start({
        ...command,
        onOutput: (event) => this.acceptProcessOutput(session, event.data),
        onExit: (event) => void this.handleProcessExit(session, event.exitCode)
      })
      if (session.snapshot.status === 'idle') {
        session.snapshot = {
          ...session.snapshot,
          processId: handle.processId,
          status: 'running'
        }
        await this.queueCheckpoint(session, true)
      }
      return handle
    } catch (error) {
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
      session.persistenceTail = session.persistenceTail
        .then(async () => {
          const result = await this.store.appendOutput(session.snapshot, output)
          if (result === 'checkpoint-required') await this.persistCheckpoint(session, true)
        })
        .catch((error) => this.recordPersistenceFailure(error, session))
      this.scheduleCheckpoint(session)
    }
  }

  private async handleProcessExit(
    session: ProviderTerminalSession,
    exitCode: number | null
  ): Promise<void> {
    if (session.retired) return
    if (session.checkpointTimer) clearTimeout(session.checkpointTimer)
    session.checkpointTimer = null
    session.snapshot = {
      ...session.snapshot,
      processId: null,
      status: 'exited',
      exitCode,
      recoveryKind: 'ended'
    }
    await this.queueCheckpoint(session, true).catch((error) =>
      this.recordPersistenceFailure(error, session)
    )
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
      await this.queueCheckpoint(session, true)
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
    await this.queueCheckpoint(session, true)
  }

  private async detachApplication(): Promise<void> {
    const retired = [...this.sessions.values()].filter(
      ({ snapshot }) =>
        snapshot.retentionPolicy === 'terminate-on-application-exit' || snapshot.kind === 'workflow'
    )
    const stops = retired
      .filter(({ snapshot }) => snapshot.status === 'running')
      .map(({ snapshot }) => this.processes.stop(snapshot.sessionId))
    await Promise.allSettled(stops)
    for (const { snapshot } of retired) await this.retireSession(snapshot)
    for (const session of this.sessions.values()) {
      await this.queueCheckpoint(session, true).catch((error) =>
        this.recordPersistenceFailure(error, session)
      )
    }
    if (!this.hasRetainedLiveSessions()) this.scheduleExit()
  }

  private async handleUnexpectedControllerDisconnect(): Promise<void> {
    this.log('controller-disconnected')
    await this.detachApplication()
  }

  private async retireSession(identity: TerminalRunScope): Promise<void> {
    const session = this.sessions.get(identity.sessionId)
    if (!session || !isSameTerminalRun(session.snapshot, identity)) return
    session.retired = true
    if (session.checkpointTimer) clearTimeout(session.checkpointTimer)
    await session.persistenceTail.catch(() => undefined)
    this.models.retire(identity)
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
        onQueryResponse: () => undefined,
        onFlowControlChange: () => undefined
      })
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
        onQueryResponse: () => undefined,
        onFlowControlChange: () => undefined
      })
      const snapshot: TerminalSessionSnapshot = {
        ...bundle.checkpoint.session,
        processId: null,
        status: 'exited',
        recoveryKind: 'historical'
      }
      const session: ProviderTerminalSession = {
        snapshot,
        checkpointTimer: null,
        persistenceTail: Promise.resolve(),
        managedServiceEndpoint: undefined,
        retired: false
      }
      this.sessions.set(snapshot.sessionId, session)
      await this.writeCheckpoint(session, historicalCheckpoint, true)
    }
  }

  private scheduleCheckpoint(session: ProviderTerminalSession): void {
    if (session.checkpointTimer) return
    session.checkpointTimer = setTimeout(() => {
      session.checkpointTimer = null
      void this.queueCheckpoint(session, true).catch((error) =>
        this.recordPersistenceFailure(error, session)
      )
    }, checkpointIntervalMs)
  }

  private queueCheckpoint(
    session: ProviderTerminalSession,
    truncateOutputLog: boolean
  ): Promise<void> {
    session.persistenceTail = session.persistenceTail
      .catch(() => undefined)
      .then(() => this.persistCheckpoint(session, truncateOutputLog))
    return session.persistenceTail
  }

  private async persistCheckpoint(
    session: ProviderTerminalSession,
    truncateOutputLog: boolean
  ): Promise<void> {
    if (session.retired) return
    const checkpoint = await this.models.captureCheckpoint(session.snapshot)
    if (session.retired) return
    await this.writeCheckpoint(session, checkpoint, truncateOutputLog)
  }

  private writeCheckpoint(
    session: ProviderTerminalSession,
    model: Awaited<ReturnType<TerminalModelRecoveryPort['captureCheckpoint']>>,
    truncateOutputLog: boolean
  ): Promise<void> {
    const record: TerminalRecoveryRecord = {
      schemaVersion: 1,
      providerInstanceId: this.options.instanceId,
      updatedAt: new Date().toISOString(),
      session: session.snapshot,
      model
    }
    return this.store.writeCheckpoint(record, { truncateOutputLog })
  }

  private recordPersistenceFailure(error: unknown, session?: ProviderTerminalSession): void {
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
    return session
  }

  private liveSessionCount(): number {
    return [...this.sessions.values()].filter(({ snapshot }) => snapshot.status === 'running')
      .length
  }

  private hasRetainedLiveSessions(): boolean {
    return [...this.sessions.values()].some(
      ({ snapshot }) =>
        snapshot.status === 'running' && snapshot.retentionPolicy === 'keep-after-application-exit'
    )
  }

  private scheduleExit(): void {
    setTimeout(() => {
      void this.close().finally(() => this.options.onExitRequested?.())
    }, 50)
  }

  private broadcast(event: TerminalProviderEvent): void {
    if (this.controller && !this.controller.destroyed) this.send(this.controller, event)
  }

  private send(socket: Socket, message: TerminalProviderResponse | TerminalProviderEvent): void {
    if (!socket.destroyed) socket.write(encodeTerminalProviderFrame(message))
  }

  private log(message: string, details: Readonly<Record<string, unknown>> = {}): void {
    this.options.log?.(message, details)
  }
}

interface ProviderTerminalSession {
  snapshot: TerminalSessionSnapshot
  checkpointTimer: ReturnType<typeof setTimeout> | null
  persistenceTail: Promise<void>
  managedServiceEndpoint: ActualServiceEndpoint | undefined
  retired: boolean
}

interface TerminalProviderRequestParams {
  readonly command: Omit<StartTerminalProcessCommand, 'onOutput' | 'onExit'> & {
    readonly identity: TerminalRunScope
  }
  readonly sessionId: string
  readonly input: string
  readonly columns: number
  readonly rows: TerminalScrollbackRows
  readonly identity: TerminalRunScope
  readonly viewId: string
  readonly workingDirectory: string
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly endpoint: ActualServiceEndpoint
}
