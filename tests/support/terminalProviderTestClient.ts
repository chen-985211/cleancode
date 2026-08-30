import { randomUUID } from 'node:crypto'
import { connect, type Socket } from 'node:net'

import {
  encodeTerminalProviderFrame,
  type TerminalProviderEvent,
  TerminalProviderFrameDecoder,
  type TerminalProviderResponse,
  terminalProviderProtocolVersion
} from '../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'

export class TerminalProviderTestClient {
  private readonly decoder = new TerminalProviderFrameDecoder()
  private readonly responses = new Map<
    string,
    { readonly resolve: (value: unknown) => void; readonly reject: (error: unknown) => void }
  >()
  private readonly events: TerminalProviderEvent[] = []
  private controllerLeaseId: string | undefined

  private constructor(
    private readonly socket: Socket,
    private readonly authToken: string
  ) {
    socket.on('data', (chunk) => {
      for (const message of this.decoder.push(chunk)) this.accept(message)
    })
  }

  static async connect(endpoint: string, authToken: string): Promise<TerminalProviderTestClient> {
    const socket = connect(endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('error', reject)
    })
    return new TerminalProviderTestClient(socket, authToken)
  }

  request<T = void>(
    method: string,
    params?: unknown,
    protocolVersion = terminalProviderProtocolVersion,
    deadlineMs?: number
  ): Promise<T> {
    const requestId = randomUUID()
    this.socket.write(
      encodeTerminalProviderFrame({
        type: 'request',
        protocolVersion,
        requestId,
        authToken: this.authToken,
        controllerLeaseId: this.controllerLeaseId,
        method,
        params,
        deadlineMs
      })
    )
    return new Promise<T>((resolve, reject) => {
      this.responses.set(requestId, {
        resolve: (value) => {
          if (method === 'claimController' && isControllerClaim(value)) {
            this.controllerLeaseId = value.controllerLeaseId
          }
          resolve(value as T)
        },
        reject
      })
    })
  }

  async waitForEvent(
    event: TerminalProviderEvent['event'],
    count = 1
  ): Promise<TerminalProviderEvent> {
    await vi.waitFor(() =>
      expect(
        this.events.filter((candidate) => candidate.event === event).length
      ).toBeGreaterThanOrEqual(count)
    )
    return this.events.filter((candidate) => candidate.event === event)[
      count - 1
    ] as TerminalProviderEvent
  }

  close(): void {
    this.socket.destroy()
  }

  private accept(value: unknown): void {
    const message = value as TerminalProviderResponse | TerminalProviderEvent
    if (message.type === 'event') {
      this.events.push(message)
      return
    }
    const pending = this.responses.get(message.requestId)
    if (!pending) return
    this.responses.delete(message.requestId)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(message.error)
  }
}

function isControllerClaim(value: unknown): value is { readonly controllerLeaseId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'controllerLeaseId' in value &&
    typeof value.controllerLeaseId === 'string'
  )
}
