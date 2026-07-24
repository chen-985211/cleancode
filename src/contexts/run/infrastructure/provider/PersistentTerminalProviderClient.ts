import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

import type {
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../../application/dto/TerminalModelSnapshot'
import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import type {
  AttachTerminalViewCommand,
  CreateTerminalModelCommand,
  SequencedTerminalOutput,
  TerminalModelPort
} from '../../application/ports/TerminalModelPort'
import type {
  ForegroundJobProcessIdentity,
  LaunchForegroundJobProcessCommand,
  StartTerminalProcessCommand,
  TerminalExitEvent,
  TerminalProcessHandle,
  TerminalProcessOutputEvent,
  TerminalProcessPort
} from '../../application/ports/TerminalProcessPort'
import type {
  TerminalRuntimeProviderPort,
  TerminalRuntimeRecoveryIssue,
  TerminalRuntimeRecoveryResult
} from '../../application/ports/TerminalRuntimeProviderPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import {
  isBlockTerminalOwner,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import {
  createExpectedAppError,
  isAppError
} from '../../../../shared-kernel/application/errors/AppError'
import {
  type TerminalProviderEvent,
  terminalProviderApplicationDetachProtocolVersion,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import { TerminalProviderRpcConnection } from './TerminalProviderRpcConnection'
import {
  acquireProviderLaunchLock,
  atomicWriteProviderMetadata,
  createProviderEndpoint,
  delayProviderOperation,
  getProviderErrorMessage,
  isApplicationDetachReceipt,
  isProviderProcessAlive,
  matchesForegroundJob,
  providerEndpointAcceptsConnections,
  readProviderMetadata,
  removeStaleProviderMetadata,
  rotateProviderLog,
  type TerminalProviderMetadata
} from './PersistentTerminalProviderClientSupport'
import { TerminalProviderProcessEventGate } from './TerminalProviderProcessEventGate'

const providerStartupTimeoutMs = 5_000
const providerControllerClaimTimeoutMs = 5_000

export interface PersistentTerminalProviderClientOptions {
  readonly stateDirectory: string
  readonly providerEntryPath: string
  readonly executablePath?: string
  readonly onBackgroundError?: (error: unknown) => void
  readonly onRuntimeUnavailable?: (error: unknown) => void
  readonly onOutput?: (event: TerminalProcessOutputEvent) => void
}

export class PersistentTerminalProviderClient
  implements TerminalProcessPort, TerminalModelPort, TerminalRuntimeProviderPort
{
  private connection: TerminalProviderRpcConnection | null = null
  private readonly processCallbacks = new Map<
    string,
    {
      readonly onOutput: (event: TerminalProcessOutputEvent) => void
      readonly onExit: (event: TerminalExitEvent) => void
    }
  >()
  private readonly foregroundJobCallbacks = new Map<string, LaunchForegroundJobProcessCommand>()
  private readonly viewCallbacks = new Map<string, AttachTerminalViewCommand>()
  private readonly pendingModelCreates = new Map<string, Promise<unknown>>()
  private readonly processEventGate = new TerminalProviderProcessEventGate()
  private readonly workingDirectories = new Map<string, string>()
  private readonly identities = new Map<string, TerminalRunScope>()
  private connectionAttempt: Promise<TerminalProviderMetadata> | null = null
  private connectedMetadata: TerminalProviderMetadata | null = null
  private isDetaching = false
  private recoveryIssueHandler: ((issue: TerminalRuntimeRecoveryIssue) => void) | null = null
  private scrollbackRows: TerminalScrollbackRows = 1000
  private readonly controllerId = randomUUID()

  constructor(private readonly options: PersistentTerminalProviderClientOptions) {}

  async initialize(): Promise<TerminalRuntimeRecoveryResult> {
    const metadata = await this.ensureProviderConnection()
    const connection = this.requireConnection()
    const result = await connection.request<TerminalRuntimeRecoveryResult>('listSessions')
    for (const session of result.sessions) {
      this.identities.set(session.sessionId, session)
      this.workingDirectories.set(session.sessionId, session.workingDirectory)
    }
    if (metadata.instanceId !== connection.instanceId) {
      throw providerUnavailable(
        'Terminal provider identity did not match its authenticated metadata.'
      )
    }
    return result
  }

  bindRecoveredSession(
    identity: TerminalRunScope,
    callbacks: {
      readonly onOutput: (event: TerminalProcessOutputEvent) => void
      readonly onExit: (event: TerminalExitEvent) => void
    }
  ): void {
    this.identities.set(identity.sessionId, identity)
    this.processCallbacks.set(identity.sessionId, callbacks)
  }

  bindRecoveryIssueHandler(handler: (issue: TerminalRuntimeRecoveryIssue) => void): void {
    this.recoveryIssueHandler = handler
  }

  create(command: CreateTerminalModelCommand): void {
    this.identities.set(command.identity.sessionId, command.identity)
    this.workingDirectories.set(command.identity.sessionId, command.workingDirectory)
    const request = this.request('createModel', {
      command: {
        identity: command.identity,
        columns: command.columns,
        rows: command.rows,
        workingDirectory: command.workingDirectory,
        terminalSourceTheme: command.terminalSourceTheme
      }
    })
    this.pendingModelCreates.set(command.identity.sessionId, request)
    void request.then(
      () => {
        if (this.pendingModelCreates.get(command.identity.sessionId) === request) {
          this.pendingModelCreates.delete(command.identity.sessionId)
        }
      },
      () => {
        if (this.pendingModelCreates.get(command.identity.sessionId) === request) {
          this.pendingModelCreates.delete(command.identity.sessionId)
        }
      }
    )
  }

  acceptOutput(): SequencedTerminalOutput {
    throw new Error('Provider-owned output must not be accepted by the application model proxy.')
  }

  async start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle> {
    await this.pendingModelCreates.get(command.scope.sessionId)
    const sessionId = command.scope.sessionId
    this.processCallbacks.set(sessionId, {
      onOutput: command.onOutput,
      onExit: command.onExit
    })
    this.identities.set(sessionId, command.scope)
    this.processEventGate.begin(sessionId)
    try {
      const handle = await this.request<TerminalProcessHandle>('startProcess', {
        command: {
          scope: command.scope,
          workingDirectory: command.workingDirectory,
          terminalSourceTheme: command.terminalSourceTheme,
          shell: command.shell,
          launchCommand: command.launchCommand,
          launchMode: command.launchMode,
          sessionKind: command.sessionKind,
          environment: command.environment,
          columns: command.columns,
          rows: command.rows
        }
      })
      setImmediate(() => {
        for (const event of this.processEventGate.release(sessionId)) this.handleEvent(event)
      })
      return handle
    } catch (error) {
      this.processEventGate.forget(sessionId)
      this.processCallbacks.delete(sessionId)
      throw error
    }
  }

  write(sessionId: string, input: string): void {
    this.backgroundRequest('write', { sessionId, input })
  }

  launchForegroundJob(command: LaunchForegroundJobProcessCommand): void {
    this.foregroundJobCallbacks.set(command.sessionId, command)
    void this.request('launchForegroundJob', {
      foregroundJob: {
        args: command.args,
        environment: command.environment,
        executable: command.executable,
        generation: command.generation,
        launchId: command.launchId,
        sessionId: command.sessionId
      }
    }).catch((error) => {
      if (this.foregroundJobCallbacks.get(command.sessionId) !== command) return
      this.foregroundJobCallbacks.delete(command.sessionId)
      this.options.onBackgroundError?.(error)
      command.onExit({
        generation: command.generation,
        launchId: command.launchId,
        sessionId: command.sessionId,
        exitCode: null
      })
    })
  }

  pauseOutput(sessionId: string): void {
    this.backgroundRequest('pauseOutput', { sessionId })
  }

  resumeOutput(sessionId: string): void {
    this.backgroundRequest('resumeOutput', { sessionId })
  }

  async stop(sessionId: string): Promise<void> {
    await this.request('stopProcess', { sessionId })
    this.foregroundJobCallbacks.delete(sessionId)
  }

  async disposeAll(): Promise<void> {
    await this.request('disposeProcesses')
    this.foregroundJobCallbacks.clear()
    await this.request('disposeModels')
  }

  async attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot> {
    this.viewCallbacks.set(command.identity.sessionId, command)
    try {
      const snapshot = await this.request<TerminalSnapshot>('attachView', {
        identity: command.identity,
        viewId: command.viewId
      })
      this.workingDirectories.set(command.identity.sessionId, snapshot.workingDirectory)
      return snapshot
    } catch (error) {
      this.viewCallbacks.delete(command.identity.sessionId)
      throw error
    }
  }

  async detachView(identity: TerminalRunScope, viewId: string): Promise<void> {
    await this.request('detachView', { identity, viewId })
    if (this.viewCallbacks.get(identity.sessionId)?.viewId === viewId) {
      this.viewCallbacks.delete(identity.sessionId)
    }
  }

  async flush(identity: TerminalRunScope): Promise<void> {
    await this.request('flushModel', { identity })
  }

  readWorkingDirectory(identity: TerminalRunScope): string
  readWorkingDirectory(sessionId: string): Promise<string | null>
  readWorkingDirectory(
    identityOrSessionId: TerminalRunScope | string
  ): string | Promise<string | null> {
    if (typeof identityOrSessionId === 'string') {
      return this.request('readWorkingDirectory', { sessionId: identityOrSessionId })
    }
    return (
      this.workingDirectories.get(identityOrSessionId.sessionId) ??
      identityOrSessionId.workspaceDirectory
    )
  }

  resize(identity: TerminalRunScope, columns: number, rows: number): void
  resize(sessionId: string, columns: number, rows: number): void
  resize(identityOrSessionId: TerminalRunScope | string, columns: number, rows: number): void {
    if (typeof identityOrSessionId === 'string') {
      this.backgroundRequest('resizeProcess', { sessionId: identityOrSessionId, columns, rows })
      return
    }
    this.backgroundRequest('resizeModel', { identity: identityOrSessionId, columns, rows })
  }

  setScrollbackRows(rows: TerminalScrollbackRows): void {
    this.scrollbackRows = rows
    if (!this.connection) return
    this.backgroundRequest('setScrollbackRows', { rows })
  }

  updateWorkingDirectory(identity: TerminalRunScope, workingDirectory: string): void {
    this.workingDirectories.set(identity.sessionId, workingDirectory)
    this.backgroundRequest('updateWorkingDirectory', { identity, workingDirectory })
  }

  retire(identity: TerminalRunScope): void {
    this.viewCallbacks.delete(identity.sessionId)
    this.processCallbacks.delete(identity.sessionId)
    this.foregroundJobCallbacks.delete(identity.sessionId)
    this.processEventGate.forget(identity.sessionId)
    this.identities.delete(identity.sessionId)
    this.workingDirectories.delete(identity.sessionId)
    this.backgroundRequest('retireModel', { identity })
  }

  async retireSession(identity: TerminalRunScope): Promise<void> {
    this.viewCallbacks.delete(identity.sessionId)
    this.processCallbacks.delete(identity.sessionId)
    this.foregroundJobCallbacks.delete(identity.sessionId)
    this.processEventGate.forget(identity.sessionId)
    this.identities.delete(identity.sessionId)
    this.workingDirectories.delete(identity.sessionId)
    await this.request('retireModel', { identity })
  }

  getDiagnostics(): TerminalModelDiagnosticsSnapshot {
    return {
      modelCount: this.identities.size,
      attachedViewCount: this.viewCallbacks.size,
      pendingOutputBytes: 0,
      lastRestoreDurationMs: 0
    }
  }

  setRetentionPolicy(sessionId: string, retentionPolicy: TerminalRetentionPolicy): Promise<void> {
    return this.request('setRetention', { sessionId, retentionPolicy })
  }

  recordManagedServiceEndpoint(sessionId: string, endpoint: ActualServiceEndpoint): Promise<void> {
    return this.request('recordManagedServiceEndpoint', { sessionId, endpoint })
  }

  async detachApplication(): Promise<void> {
    this.isDetaching = true
    await this.connectionAttempt?.catch(() => undefined)
    if (!this.connection) {
      this.connectedMetadata = null
      this.clearApplicationReferences()
      return
    }
    const connection = this.connection
    const protocolVersion = this.connectedMetadata?.protocolVersion ?? 0
    try {
      if (protocolVersion >= terminalProviderApplicationDetachProtocolVersion) {
        const receipt = await connection.request<unknown>('beginApplicationDetach')
        if (!isApplicationDetachReceipt(receipt)) {
          throw providerUnavailable('Terminal provider returned an invalid detach receipt.')
        }
        await connection.request('awaitApplicationDetach', { releaseId: receipt.releaseId })
      } else {
        await connection.request('detachApplication')
      }
    } finally {
      if (this.connection === connection) {
        this.connection = null
        this.connectedMetadata = null
      }
      connection.close()
      this.clearApplicationReferences()
    }
  }

  private ensureProviderConnection(): Promise<TerminalProviderMetadata> {
    if (this.connection && this.connectedMetadata) return Promise.resolve(this.connectedMetadata)
    if (this.connectionAttempt) return this.connectionAttempt
    if (this.isDetaching) {
      return Promise.reject(
        providerUnavailable('Terminal provider connection is closed for application shutdown.')
      )
    }
    const tracked = (async () => {
      try {
        const metadata = await this.connectOrLaunchProvider()
        await this.requireConnection().request('setScrollbackRows', {
          rows: this.scrollbackRows
        })
        this.connectedMetadata = metadata
        return metadata
      } finally {
        this.connectionAttempt = null
      }
    })()
    this.connectionAttempt = tracked
    return tracked
  }

  private async connectOrLaunchProvider(): Promise<TerminalProviderMetadata> {
    await mkdir(this.options.stateDirectory, { mode: 0o700, recursive: true })
    const metadataPath = this.metadataPath()
    let launchLock = await this.acquireLaunchLock()
    if (!launchLock) {
      try {
        return await this.waitForProviderLaunch(metadataPath)
      } catch (error) {
        launchLock = await this.acquireLaunchLock()
        if (!launchLock) throw error
      }
    }

    try {
      return await this.connectOrLaunchWithLock(metadataPath)
    } finally {
      await launchLock.close()
    }
  }

  private async connectOrLaunchWithLock(metadataPath: string): Promise<TerminalProviderMetadata> {
    const hasMetadata = existsSync(metadataPath)
    const existing = await readProviderMetadata(metadataPath)
    if (hasMetadata && !existing) {
      throw providerUnavailable(
        'Terminal provider metadata exists but cannot be authenticated safely.'
      )
    }
    if (existing) {
      try {
        await this.connectMetadata(existing)
        return existing
      } catch (error) {
        if (await providerEndpointAcceptsConnections(existing.endpoint)) throw error
        if (isProviderProcessAlive(existing.processId)) {
          throw providerUnavailable(
            'Terminal provider process is present but its authenticated endpoint is unavailable.'
          )
        }
        await removeStaleProviderMetadata(existing, metadataPath)
      }
    }

    const metadata = await this.launchProvider(metadataPath)
    return this.waitForProviderLaunch(metadataPath, metadata)
  }

  private async waitForProviderLaunch(
    metadataPath: string,
    launchedMetadata?: TerminalProviderMetadata
  ): Promise<TerminalProviderMetadata> {
    const deadline = Date.now() + providerStartupTimeoutMs
    let lastError: unknown = null
    while (Date.now() < deadline) {
      const metadata = launchedMetadata ?? (await readProviderMetadata(metadataPath))
      if (!metadata) {
        await delayProviderOperation(50)
        continue
      }
      if (this.connection?.instanceId === metadata.instanceId) return metadata
      try {
        await this.connectMetadata(metadata)
        return metadata
      } catch (error) {
        lastError = error
        await delayProviderOperation(50)
      }
    }
    throw providerUnavailable(
      `Terminal provider did not become ready: ${getProviderErrorMessage(lastError)}`
    )
  }

  private acquireLaunchLock() {
    return acquireProviderLaunchLock(this.launchLockPath())
  }

  private async connectMetadata(metadata: TerminalProviderMetadata): Promise<void> {
    const connection = await TerminalProviderRpcConnection.connect({
      endpoint: metadata.endpoint,
      authToken: metadata.authToken,
      protocolVersion: metadata.protocolVersion,
      onEvent: (event) => this.handleEvent(event),
      onDisconnect: () => this.handleProviderDisconnect(connection)
    })
    try {
      const health = await connection.request<{
        readonly instanceId: string
        readonly protocolVersion: number
        readonly controllerState: 'unclaimed' | 'active' | 'releasing'
      }>('health')
      if (health.instanceId !== metadata.instanceId) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_IDENTITY_MISMATCH',
          'Terminal provider identity did not match its authenticated metadata.'
        )
      }
      if (
        health.protocolVersion !== metadata.protocolVersion ||
        health.protocolVersion < terminalProviderProtocolVersion - 1 ||
        health.protocolVersion > terminalProviderProtocolVersion
      ) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
          'Terminal provider protocol version is unsupported.'
        )
      }
      await this.claimController(connection)
      connection.instanceId = health.instanceId
      this.connection?.close()
      this.connection = connection
    } catch (error) {
      connection.close()
      throw error
    }
  }

  private async claimController(connection: TerminalProviderRpcConnection): Promise<void> {
    const deadline = Date.now() + providerControllerClaimTimeoutMs
    while (true) {
      try {
        await connection.request('claimController', {
          controllerId: this.controllerId,
          processId: process.pid
        })
        return
      } catch (error) {
        if (!isAppError(error) || error.code !== 'TERMINAL_PROVIDER_CONTROLLER_BUSY') throw error
        if (Date.now() >= deadline) throw error
        const retryAfterMs = error.details?.retryAfterMs
        await delayProviderOperation(
          typeof retryAfterMs === 'number' ? Math.max(1, Math.min(500, retryAfterMs)) : 50
        )
      }
    }
  }

  private async launchProvider(metadataPath: string): Promise<TerminalProviderMetadata> {
    const endpoint = createProviderEndpoint(this.options.stateDirectory)
    const metadata: TerminalProviderMetadata = {
      schemaVersion: 1,
      protocolVersion: terminalProviderProtocolVersion,
      instanceId: randomUUID(),
      authToken: randomBytes(32).toString('hex'),
      endpoint,
      processId: 0,
      startedAt: new Date().toISOString()
    }
    await atomicWriteProviderMetadata(metadataPath, metadata)
    const logPath = join(this.options.stateDirectory, 'provider.log')
    rotateProviderLog(logPath)
    const logFd = openSync(logPath, 'a', 0o600)
    const child = spawn(
      this.options.executablePath ?? process.execPath,
      [this.options.providerEntryPath, '--metadata', metadataPath],
      {
        detached: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', logFd, logFd]
      }
    )
    closeSync(logFd)
    child.unref()
    if (!child.pid) throw providerUnavailable('Terminal provider process could not be started.')
    const launched = { ...metadata, processId: child.pid }
    await atomicWriteProviderMetadata(metadataPath, launched)
    return launched
  }

  private handleEvent(event: TerminalProviderEvent): void {
    if (this.processEventGate.defer(event)) return

    if (event.event === 'terminal-output') {
      const output = event.payload as TerminalProcessOutputEvent & { readonly sequence: number }
      if (isBlockTerminalOwner(output.scope)) this.options.onOutput?.(output)
      this.processCallbacks.get(output.sessionId)?.onOutput(output)
      const view = this.viewCallbacks.get(output.sessionId)
      if (view) {
        view.onOutput({
          viewId: view.viewId,
          scope: output.scope,
          sessionId: output.sessionId,
          output: { data: output.data, sequence: output.sequence }
        })
      }
      return
    }
    if (event.event === 'terminal-exit') {
      const exit = event.payload as TerminalExitEvent
      this.processCallbacks.get(exit.sessionId)?.onExit(exit)
      return
    }
    if (event.event === 'foreground-job-started') {
      const started = event.payload as ForegroundJobProcessIdentity
      const callbacks = this.foregroundJobCallbacks.get(started.sessionId)
      if (callbacks && matchesForegroundJob(callbacks, started)) callbacks.onStarted(started)
      return
    }
    if (event.event === 'foreground-job-exited') {
      const exit = event.payload as ForegroundJobProcessIdentity & {
        readonly exitCode: number | null
      }
      const callbacks = this.foregroundJobCallbacks.get(exit.sessionId)
      if (!callbacks || !matchesForegroundJob(callbacks, exit)) return
      this.foregroundJobCallbacks.delete(exit.sessionId)
      callbacks.onExit(exit)
      return
    }
    if (event.event === 'recovery-issue') {
      this.recoveryIssueHandler?.(event.payload as TerminalRuntimeRecoveryIssue)
    }
  }

  private handleProviderDisconnect(connection: TerminalProviderRpcConnection): void {
    if (this.connection !== connection) return
    this.connection = null
    this.connectedMetadata = null
    const disconnectError = providerUnavailable('Terminal provider disconnected.')
    if (!this.isDetaching) {
      this.options.onBackgroundError?.(disconnectError)
      this.options.onRuntimeUnavailable?.(disconnectError)
    }
    for (const [sessionId, callbacks] of this.processCallbacks) {
      if (this.processEventGate.isPending(sessionId)) continue
      const scope = this.identities.get(sessionId)
      if (scope) callbacks.onExit({ scope, sessionId, exitCode: null })
    }
    for (const callbacks of this.foregroundJobCallbacks.values()) {
      callbacks.onExit({
        generation: callbacks.generation,
        launchId: callbacks.launchId,
        sessionId: callbacks.sessionId,
        exitCode: null
      })
    }
    this.foregroundJobCallbacks.clear()
  }

  private async request<T = void>(method: string, params?: unknown): Promise<T> {
    if (!this.connection) await this.ensureProviderConnection()
    return this.requireConnection().request<T>(method, params)
  }

  private backgroundRequest(method: string, params?: unknown): void {
    if (!this.connection) {
      const error = providerUnavailable(
        `Terminal provider is disconnected; ignored background ${method}.`
      )
      this.options.onBackgroundError?.(error)
      this.options.onRuntimeUnavailable?.(error)
      return
    }
    void this.connection
      .request(method, params)
      .catch((error) => this.options.onBackgroundError?.(error))
  }

  private requireConnection(): TerminalProviderRpcConnection {
    if (!this.connection) throw providerUnavailable('Terminal provider is not connected.')
    return this.connection
  }

  private metadataPath(): string {
    return join(this.options.stateDirectory, 'provider.json')
  }

  private launchLockPath(): string {
    return join(this.options.stateDirectory, 'provider-launch.lock')
  }

  private clearApplicationReferences(): void {
    this.processCallbacks.clear()
    this.foregroundJobCallbacks.clear()
    this.viewCallbacks.clear()
    this.pendingModelCreates.clear()
    this.processEventGate.clear()
    this.workingDirectories.clear()
    this.identities.clear()
    this.recoveryIssueHandler = null
  }
}

function providerUnavailable(message: string) {
  return createExpectedAppError('TERMINAL_PROVIDER_UNAVAILABLE', message)
}
