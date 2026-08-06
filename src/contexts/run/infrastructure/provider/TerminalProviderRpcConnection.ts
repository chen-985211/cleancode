import { randomUUID } from 'node:crypto'
import { connect, type Socket } from 'node:net'

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
  terminalProviderDefaultRequestDeadlineMs
} from './TerminalProviderProtocol'

const providerRequestDeadlineGraceMs = 100

export class TerminalProviderRpcConnection {
  instanceId = ''
  private controllerLeaseId: string | undefined
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
    private readonly protocolVersion: number,
    private readonly requestDeadlineMs: number,
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
    readonly protocolVersion: number
    readonly requestDeadlineMs?: number
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
      input.protocolVersion,
      resolveRequestDeadline(input.requestDeadlineMs),
      input.onEvent,
      input.onDisconnect
    )
  }

  request<T = void>(method: string, params?: unknown): Promise<T> {
    const requestId = randomUUID()
    const request: TerminalProviderRequest = {
      type: 'request',
      protocolVersion: this.protocolVersion,
      requestId,
      authToken: this.authToken,
      controllerLeaseId: this.controllerLeaseId,
      method,
      params,
      deadlineMs: this.requestDeadlineMs
    }
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        const error = providerUnavailable(`Terminal provider request timed out: ${method}`)
        reject(error)
        this.socket.destroy()
      }, this.requestDeadlineMs + providerRequestDeadlineGraceMs)
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

  async claimController(controllerId: string, processId: number): Promise<void> {
    const claim = await this.request<{ readonly controllerLeaseId: string }>('claimController', {
      controllerId,
      processId
    })
    if (!claim.controllerLeaseId) {
      throw providerUnavailable('Terminal provider returned an invalid controller lease.')
    }
    this.controllerLeaseId = claim.controllerLeaseId
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

function resolveRequestDeadline(value: number | undefined): number {
  if (value === undefined) return terminalProviderDefaultRequestDeadlineMs
  return Math.max(1, Math.min(terminalProviderDefaultRequestDeadlineMs, Math.floor(value)))
}
