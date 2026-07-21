import { randomBytes, randomUUID } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { connect, type Socket } from 'node:net'
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
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import {
  createClientAppError,
  createExpectedAppError,
  isSerializedAppError
} from '../../../../shared-kernel/application/errors/AppError'
import {
  encodeTerminalProviderFrame,
  type TerminalProviderEvent,
  TerminalProviderFrameDecoder,
  type TerminalProviderMessage,
  type TerminalProviderRequest,
  terminalProviderProtocolVersion
} from './TerminalProviderProtocol'
import {
  acquireProviderLaunchLock,
  atomicWriteProviderMetadata,
  createProviderEndpoint,
  delayProviderOperation,
  getProviderErrorMessage,
  isProviderProcessAlive,
  providerEndpointAcceptsConnections,
  readProviderMetadata,
  removeStaleProviderMetadata,
  rotateProviderLog,
  type TerminalProviderMetadata
} from './PersistentTerminalProviderClientSupport'

const providerStartupTimeoutMs = 5_000
const providerRequestTimeoutMs = 30_000

export interface PersistentTerminalProviderClientOptions {
  readonly stateDirectory: string
  readonly providerEntryPath: string
  readonly executablePath?: string
  readonly onBackgroundError?: (error: unknown) => void
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
  private readonly viewCallbacks = new Map<string, AttachTerminalViewCommand>()
  private readonly pendingModelCreates = new Map<string, Promise<unknown>>()
  private readonly workingDirectories = new Map<string, string>()
  private readonly identities = new Map<string, TerminalRunScope>()
  private recoveryIssueHandler: ((issue: TerminalRuntimeRecoveryIssue) => void) | null = null
  private scrollbackRows: TerminalScrollbackRows = 1000

  constructor(private readonly options: PersistentTerminalProviderClientOptions) {}

  async initialize(): Promise<TerminalRuntimeRecoveryResult> {
    const metadata = await this.connectOrLaunchProvider()
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
        workingDirectory: command.workingDirectory
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
    this.processCallbacks.set(command.scope.sessionId, {
      onOutput: command.onOutput,
      onExit: command.onExit
    })
    this.identities.set(command.scope.sessionId, command.scope)
    try {
      return await this.request('startProcess', {
        command: {
          scope: command.scope,
          workingDirectory: command.workingDirectory,
          shell: command.shell,
          launchCommand: command.launchCommand,
          launchMode: command.launchMode,
          sessionKind: command.sessionKind,
          environment: command.environment,
          columns: command.columns,
          rows: command.rows
        }
      })
    } catch (error) {
      this.processCallbacks.delete(command.scope.sessionId)
      throw error
    }
  }

  write(sessionId: string, input: string): void {
    this.backgroundRequest('write', { sessionId, input })
  }

  pauseOutput(sessionId: string): void {
    this.backgroundRequest('pauseOutput', { sessionId })
  }

  resumeOutput(sessionId: string): void {
    this.backgroundRequest('resumeOutput', { sessionId })
  }

  async stop(sessionId: string): Promise<void> {
    await this.request('stopProcess', { sessionId })
  }

  async disposeAll(): Promise<void> {
    await this.request('disposeProcesses')
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
    this.backgroundRequest('setScrollbackRows', { rows })
  }

  updateWorkingDirectory(identity: TerminalRunScope, workingDirectory: string): void {
    this.workingDirectories.set(identity.sessionId, workingDirectory)
    this.backgroundRequest('updateWorkingDirectory', { identity, workingDirectory })
  }

  retire(identity: TerminalRunScope): void {
    this.viewCallbacks.delete(identity.sessionId)
    this.processCallbacks.delete(identity.sessionId)
    this.identities.delete(identity.sessionId)
    this.workingDirectories.delete(identity.sessionId)
    this.backgroundRequest('retireModel', { identity })
  }

  async retireSession(identity: TerminalRunScope): Promise<void> {
    this.viewCallbacks.delete(identity.sessionId)
    this.processCallbacks.delete(identity.sessionId)
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
    if (!this.connection) return
    try {
      await this.connection.request('detachApplication')
    } finally {
      this.connection.close()
      this.connection = null
    }
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
      await rm(this.launchLockPath(), { force: true })
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
      onEvent: (event) => this.handleEvent(event),
      onDisconnect: () => this.handleProviderDisconnect(connection)
    })
    try {
      const health = await connection.request<{
        readonly instanceId: string
        readonly protocolVersion: number
        readonly isController: boolean
      }>('health')
      if (
        health.instanceId !== metadata.instanceId ||
        health.protocolVersion !== terminalProviderProtocolVersion ||
        !health.isController
      ) {
        throw providerUnavailable(
          'Terminal provider returned incompatible identity or controller evidence.'
        )
      }
      connection.instanceId = health.instanceId
      this.connection?.close()
      this.connection = connection
    } catch (error) {
      connection.close()
      throw error
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
    if (event.event === 'terminal-output') {
      const output = event.payload as TerminalProcessOutputEvent & { readonly sequence: number }
      this.options.onOutput?.(output)
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
    if (event.event === 'recovery-issue') {
      this.recoveryIssueHandler?.(event.payload as TerminalRuntimeRecoveryIssue)
    }
  }

  private handleProviderDisconnect(connection: TerminalProviderRpcConnection): void {
    if (this.connection !== connection) return
    this.connection = null
    for (const [sessionId, callbacks] of this.processCallbacks) {
      const scope = this.identities.get(sessionId)
      if (scope) callbacks.onExit({ scope, sessionId, exitCode: null })
    }
  }

  private async request<T = void>(method: string, params?: unknown): Promise<T> {
    if (!this.connection) await this.connectOrLaunchProvider()
    return this.requireConnection().request<T>(method, params)
  }

  private backgroundRequest(method: string, params?: unknown): void {
    if (!this.connection) {
      this.options.onBackgroundError?.(
        providerUnavailable(`Terminal provider is disconnected; ignored background ${method}.`)
      )
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
}

class TerminalProviderRpcConnection {
  instanceId = ''
  private readonly pending = new Map<
    string,
    {
      readonly resolve: (value: unknown) => void
      readonly reject: (error: unknown) => void
      readonly timeout: ReturnType<typeof setTimeout>
    }
  >()
  private readonly decoder = new TerminalProviderFrameDecoder()

  private constructor(
    private readonly socket: Socket,
    private readonly authToken: string,
    private readonly onEvent: (event: TerminalProviderEvent) => void,
    private readonly onDisconnect: () => void
  ) {
    socket.on('data', (chunk) => {
      try {
        for (const message of this.decoder.push(chunk)) this.handleMessage(message)
      } catch (error) {
        this.failAll(error)
        socket.destroy()
      }
    })
    socket.on('close', () => {
      this.failAll(providerUnavailable('Terminal provider disconnected.'))
      this.onDisconnect()
    })
    socket.on('error', (error) => this.failAll(error))
  }

  static async connect(input: {
    readonly endpoint: string
    readonly authToken: string
    readonly onEvent: (event: TerminalProviderEvent) => void
    readonly onDisconnect: () => void
  }): Promise<TerminalProviderRpcConnection> {
    const socket = connect(input.endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    return new TerminalProviderRpcConnection(
      socket,
      input.authToken,
      input.onEvent,
      input.onDisconnect
    )
  }

  request<T = void>(method: string, params?: unknown): Promise<T> {
    const requestId = randomUUID()
    const request: TerminalProviderRequest = {
      type: 'request',
      protocolVersion: terminalProviderProtocolVersion,
      requestId,
      authToken: this.authToken,
      method,
      params
    }
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(providerUnavailable(`Terminal provider request timed out: ${method}`))
      }, providerRequestTimeoutMs)
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout
      })
      this.socket.write(encodeTerminalProviderFrame(request))
    })
  }

  close(): void {
    this.socket.end()
    this.socket.destroy()
  }

  private handleMessage(value: unknown): void {
    if (!isProviderMessage(value)) {
      throw new Error('Terminal provider returned an invalid message.')
    }
    if (value.type === 'event') {
      this.onEvent(value)
      return
    }
    const pending = this.pending.get(value.requestId)
    if (!pending) return
    this.pending.delete(value.requestId)
    clearTimeout(pending.timeout)
    if (value.ok) pending.resolve(value.result)
    else if (isSerializedAppError(value.error)) pending.reject(createClientAppError(value.error))
    else pending.reject(providerUnavailable('Terminal provider returned an invalid error.'))
  }

  private failAll(error: unknown): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

function isProviderMessage(value: unknown): value is TerminalProviderMessage {
  if (typeof value !== 'object' || value === null || !('type' in value)) return false
  if (value.type === 'event') return 'event' in value && 'payload' in value
  return value.type === 'response' && 'requestId' in value && 'ok' in value
}

function providerUnavailable(message: string) {
  return createExpectedAppError('TERMINAL_PROVIDER_UNAVAILABLE', message)
}
