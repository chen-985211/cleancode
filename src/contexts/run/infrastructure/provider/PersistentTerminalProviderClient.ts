import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

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
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  type TerminalProviderEvent,
  terminalProviderApplicationDetachProtocolVersion,
  terminalProviderMinimumCompatibleProtocolVersion,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import { TerminalProviderRpcConnection } from './TerminalProviderRpcConnection'
import {
  acquireProviderLaunchLock,
  createProviderDiagnostics,
  createProviderUnavailableError as providerUnavailable,
  isApplicationDetachReceipt,
  isProviderProcessAlive,
  isRuntimeInvalidatingProviderError,
  matchesForegroundJob,
  providerEndpointAcceptsConnections,
  readProviderMetadata,
  removeStaleProviderMetadata,
  runWithProviderLaunchLock,
  type TerminalProviderMetadata
} from './PersistentTerminalProviderClientSupport'
import {
  claimTerminalProviderController,
  waitForTerminalProviderLaunch
} from './TerminalProviderLaunchReadiness'
import {
  launchTerminalProviderProcess,
  type TerminalProviderProcessExitSignal,
  type TerminalProviderProcessLaunch,
  type TerminalProviderProcessLaunchOptions
} from './TerminalProviderProcessLauncher'
import { observeTerminalProviderLiveness } from './TerminalProviderHeartbeat'
import { TerminalProviderProcessEventGate } from './TerminalProviderProcessEventGate'
import { TerminalProviderTitleEventBridge } from './TerminalProviderTitleEventBridge'

export interface PersistentTerminalProviderClientOptions {
  readonly stateDirectory: string
  readonly providerEntryPath: string
  readonly executablePath?: string
  readonly resolveLaunchTarget?: TerminalProviderProcessLaunchOptions['resolveLaunchTarget']
  readonly spawnProcess?: TerminalProviderProcessLaunchOptions['spawnProcess']
  readonly onBackgroundError?: (error: unknown) => void
  readonly onRuntimeUnavailable?: (error: unknown) => void
  readonly onOutput?: (event: TerminalProcessOutputEvent) => void
  readonly requestDeadlineMs?: number
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
  private readonly titleEvents = new TerminalProviderTitleEventBridge()
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
    this.titleEvents.bind(command.identity.sessionId, command.onTitleChanged)
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
    this.titleEvents.forget(identity.sessionId)
    this.processEventGate.forget(identity.sessionId)
    this.identities.delete(identity.sessionId)
    this.workingDirectories.delete(identity.sessionId)
    this.backgroundRequest('retireModel', { identity })
  }

  async retireSession(identity: TerminalRunScope): Promise<void> {
    this.viewCallbacks.delete(identity.sessionId)
    this.processCallbacks.delete(identity.sessionId)
    this.foregroundJobCallbacks.delete(identity.sessionId)
    this.titleEvents.forget(identity.sessionId)
    this.processEventGate.forget(identity.sessionId)
    this.identities.delete(identity.sessionId)
    this.workingDirectories.delete(identity.sessionId)
    await this.request('retireModel', { identity })
  }

  getDiagnostics(): TerminalModelDiagnosticsSnapshot {
    return createProviderDiagnostics(this.identities.size, this.viewCallbacks.size)
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
    const metadataPath = join(this.options.stateDirectory, 'provider.json')
    let launchLock = await this.acquireLaunchLock()
    if (!launchLock) {
      try {
        return await this.waitForProviderLaunch(metadataPath)
      } catch (error) {
        launchLock = await this.acquireLaunchLock()
        if (!launchLock) throw error
      }
    }

    return runWithProviderLaunchLock(
      launchLock,
      (assertLeaseHealthy) => this.connectOrLaunchWithLock(metadataPath, assertLeaseHealthy),
      (error) => this.options.onBackgroundError?.(error)
    )
  }

  private async connectOrLaunchWithLock(
    metadataPath: string,
    assertLeaseHealthy: () => Promise<void>
  ): Promise<TerminalProviderMetadata> {
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
        const liveness = await observeTerminalProviderLiveness(
          this.options.stateDirectory,
          existing,
          isProviderProcessAlive
        )
        if (liveness.state !== 'dead') {
          throw providerUnavailable(
            liveness.state === 'unknown'
              ? 'Terminal provider liveness could not be authenticated safely.'
              : 'Terminal provider process is present but its authenticated endpoint is unavailable.'
          )
        }
        await assertLeaseHealthy()
        const removed = await removeStaleProviderMetadata(existing, metadataPath, {
          requireDeadLiveness: true
        })
        await assertLeaseHealthy()
        if (!removed) {
          throw providerUnavailable(
            'Terminal provider metadata changed or became live while stale ownership was being reconciled.'
          )
        }
      }
    }

    const launch = await this.launchProvider(metadataPath, assertLeaseHealthy)
    try {
      return await this.waitForProviderLaunch(metadataPath, launch.metadata, launch.exitSignal)
    } catch (error) {
      if (!launch.metadata.runtimeImageKey || !launch.exitSignal.hasExited()) throw error
      this.options.onBackgroundError?.(error)
      await assertLeaseHealthy()
      const removed = await removeStaleProviderMetadata(launch.metadata, metadataPath)
      await assertLeaseHealthy()
      if (!removed) {
        throw providerUnavailable(
          'Terminal provider metadata changed before runtime-image fallback could start.'
        )
      }
      const fallback = await this.launchProvider(metadataPath, assertLeaseHealthy, true)
      return this.waitForProviderLaunch(metadataPath, fallback.metadata, fallback.exitSignal)
    }
  }

  private waitForProviderLaunch(
    metadataPath: string,
    launchedMetadata?: TerminalProviderMetadata,
    exitSignal?: TerminalProviderProcessExitSignal
  ): Promise<TerminalProviderMetadata> {
    return waitForTerminalProviderLaunch({
      connectMetadata: (metadata) => this.connectMetadata(metadata),
      exitSignal,
      getCurrentConnectionInstanceId: () => this.connection?.instanceId,
      launchedMetadata,
      metadataPath
    })
  }

  private acquireLaunchLock() {
    return acquireProviderLaunchLock(join(this.options.stateDirectory, 'provider-launch.lock'))
  }

  private async connectMetadata(metadata: TerminalProviderMetadata): Promise<void> {
    const connection = await TerminalProviderRpcConnection.connect({
      endpoint: metadata.endpoint,
      authToken: metadata.authToken,
      protocolVersion: metadata.protocolVersion,
      requestDeadlineMs: this.options.requestDeadlineMs,
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
        health.protocolVersion < terminalProviderMinimumCompatibleProtocolVersion ||
        health.protocolVersion > terminalProviderProtocolVersion
      ) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
          'Terminal provider protocol version is unsupported.'
        )
      }
      await claimTerminalProviderController(connection, this.controllerId)
      connection.instanceId = health.instanceId
      const previousConnection = this.connection
      this.connection = connection
      previousConnection?.close()
    } catch (error) {
      connection.close()
      throw error
    }
  }

  private async launchProvider(
    metadataPath: string,
    assertLaunchAllowed?: () => Promise<void>,
    useInstalledTarget = false
  ): Promise<TerminalProviderProcessLaunch> {
    return launchTerminalProviderProcess({
      assertLaunchAllowed,
      executablePath: this.options.executablePath,
      metadataPath,
      providerEntryPath: this.options.providerEntryPath,
      onRuntimeImageSpawnFailure: this.options.onBackgroundError,
      resolveLaunchTarget: useInstalledTarget ? undefined : this.options.resolveLaunchTarget,
      spawnProcess: this.options.spawnProcess,
      stateDirectory: this.options.stateDirectory
    })
  }

  private handleEvent(event: TerminalProviderEvent): void {
    if (this.processEventGate.defer(event)) return

    if (event.event === 'terminal-output') {
      const output = event.payload as TerminalProcessOutputEvent & { readonly sequence: number }
      this.titleEvents.acceptOutput(output.sessionId, output.data)
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
    if (event.event === 'terminal-title') {
      const update = event.payload as {
        readonly sessionId: string
        readonly title: string
      }
      this.titleEvents.acceptTitle(update.sessionId, update.title)
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
  }

  private async request<T = void>(method: string, params?: unknown): Promise<T> {
    let connection: TerminalProviderRpcConnection | null = null
    try {
      if (!this.connection) await this.ensureProviderConnection()
      connection = this.requireConnection()
      return await connection.request<T>(method, params)
    } catch (error) {
      if (isRuntimeInvalidatingProviderError(error)) {
        if (connection && error.code === 'TERMINAL_PROVIDER_UNAVAILABLE') {
          this.invalidateConnection(connection)
        }
        this.options.onRuntimeUnavailable?.(error)
      }
      throw error
    }
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
    const connection = this.connection
    void connection.request(method, params).catch((error) => {
      this.options.onBackgroundError?.(error)
      if (isRuntimeInvalidatingProviderError(error)) {
        if (error.code === 'TERMINAL_PROVIDER_UNAVAILABLE') {
          this.invalidateConnection(connection)
        }
        this.options.onRuntimeUnavailable?.(error)
      }
    })
  }

  private invalidateConnection(connection: TerminalProviderRpcConnection): void {
    if (this.connection === connection) {
      this.connection = null
      this.connectedMetadata = null
    }
    connection.close()
  }
  private requireConnection(): TerminalProviderRpcConnection {
    if (!this.connection) throw providerUnavailable('Terminal provider is not connected.')
    return this.connection
  }
  private clearApplicationReferences(): void {
    this.processCallbacks.clear()
    this.foregroundJobCallbacks.clear()
    this.viewCallbacks.clear()
    this.titleEvents.clear()
    this.pendingModelCreates.clear()
    this.processEventGate.clear()
    this.workingDirectories.clear()
    this.identities.clear()
    this.recoveryIssueHandler = null
  }
}
