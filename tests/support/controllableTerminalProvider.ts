import { rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'

import type { TerminalRunScope } from '../../src/contexts/run/domain/value-objects/TerminalRunScope'
import {
  encodeTerminalProviderFrame,
  TerminalProviderFrameDecoder,
  type TerminalProviderRequest,
  terminalProviderProtocolVersion
} from '../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { pollUntilState } from './e2ePolling'

export class ControllableTerminalProvider {
  readonly authToken = 'provider-client-secret'
  readonly instanceId = 'provider-client-instance'
  readonly requests: TerminalProviderRequest[] = []
  connectionCount = 0
  private readonly sockets = new Set<Socket>()
  private server: Server | null = null
  private healthResponses: Deferred | null = null
  private applicationDetachCompletion: Deferred | null = null
  private readonly pausedMethodResponses = new Map<string, Deferred>()
  private readonly methodFailures = new Map<string, unknown>()
  private rejectedControllerClaims = 0
  private processLifecycleBeforeStartResponse: TerminalRunScope | null = null

  constructor(
    readonly endpoint: string,
    readonly protocolVersion: number = terminalProviderProtocolVersion
  ) {}

  async start(): Promise<void> {
    await rm(this.endpoint, { force: true })
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((socket) => this.accept(socket))
      this.server.once('error', reject)
      this.server.listen(this.endpoint, () => {
        this.server?.off('error', reject)
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    this.resumeHealthResponses()
    for (const socket of this.sockets) socket.destroy()
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
    await rm(this.endpoint, { force: true })
  }

  pauseHealthResponses(): void {
    this.healthResponses = createDeferred()
  }

  pauseApplicationDetachCompletion(): void {
    this.applicationDetachCompletion = createDeferred()
  }

  pauseMethodResponses(method: string): void {
    this.pausedMethodResponses.set(method, createDeferred())
  }

  failMethod(method: string, error: unknown): void {
    this.methodFailures.set(method, error)
  }

  resumeApplicationDetachCompletion(): void {
    this.applicationDetachCompletion?.resolve()
    this.applicationDetachCompletion = null
  }

  resumeHealthResponses(): void {
    this.healthResponses?.resolve()
    this.healthResponses = null
  }

  resumeMethodResponses(method: string): void {
    this.pausedMethodResponses.get(method)?.resolve()
    this.pausedMethodResponses.delete(method)
  }

  rejectControllerClaims(count: number): void {
    this.rejectedControllerClaims = count
  }

  disconnectClients(): void {
    for (const socket of this.sockets) socket.destroy()
  }

  emitEvent(event: string, payload: unknown): void {
    for (const socket of this.sockets) {
      socket.write(encodeTerminalProviderFrame({ event, payload, type: 'event' }))
    }
  }

  emitProcessLifecycleBeforeStartResponse(scope: TerminalRunScope): void {
    this.processLifecycleBeforeStartResponse = scope
  }

  async waitForRequests(method: string, count: number): Promise<void> {
    await pollUntilState({
      accept: (requestCount) => requestCount >= count,
      description: `${count} Provider ${method} request(s)`,
      intervalMs: 5,
      observe: () => this.requests.filter((request) => request.method === method).length,
      timeoutMs: 1_000
    })
  }

  private accept(socket: Socket): void {
    this.connectionCount += 1
    this.sockets.add(socket)
    const decoder = new TerminalProviderFrameDecoder()
    let requestTail = Promise.resolve()
    socket.on('data', (chunk) => {
      for (const value of decoder.push(chunk)) {
        requestTail = requestTail.then(() => this.respond(socket, value as TerminalProviderRequest))
      }
    })
    socket.on('close', () => this.sockets.delete(socket))
  }

  private async respond(socket: Socket, request: TerminalProviderRequest): Promise<void> {
    this.requests.push(request)
    await this.pausedMethodResponses.get(request.method)?.promise
    const failure = this.methodFailures.get(request.method)
    if (failure) {
      this.methodFailures.delete(request.method)
      socket.write(
        encodeTerminalProviderFrame({
          type: 'response',
          requestId: request.requestId,
          ok: false,
          error: failure
        })
      )
      return
    }
    if (request.method === 'health') await this.healthResponses?.promise
    if (request.method === 'awaitApplicationDetach') {
      await this.applicationDetachCompletion?.promise
    }
    if (request.method === 'claimController' && this.rejectedControllerClaims > 0) {
      this.rejectedControllerClaims -= 1
      socket.write(
        encodeTerminalProviderFrame({
          type: 'response',
          requestId: request.requestId,
          ok: false,
          error: {
            code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY',
            isExpected: true,
            message: 'Terminal provider controller is releasing.',
            details: { retryAfterMs: 1 }
          }
        })
      )
      return
    }
    if (request.method === 'startProcess' && this.processLifecycleBeforeStartResponse) {
      const scope = this.processLifecycleBeforeStartResponse
      this.processLifecycleBeforeStartResponse = null
      socket.write(
        encodeTerminalProviderFrame({
          event: 'terminal-output',
          payload: {
            data: 'fast-output',
            scope,
            sequence: 1,
            sessionId: scope.sessionId
          },
          type: 'event'
        })
      )
      socket.write(
        encodeTerminalProviderFrame({
          event: 'terminal-exit',
          payload: {
            exitCode: 0,
            scope,
            sessionId: scope.sessionId
          },
          type: 'event'
        })
      )
    }
    const result = this.resultFor(request.method, socket)
    socket.write(
      encodeTerminalProviderFrame({
        type: 'response',
        requestId: request.requestId,
        ok: true,
        result
      })
    )
  }

  private resultFor(method: string, socket: Socket): unknown {
    if (method === 'health') {
      return {
        instanceId: this.instanceId,
        protocolVersion: this.protocolVersion,
        controllerState: 'unclaimed'
      }
    }
    if (method === 'claimController') return { controllerLeaseId: 'controller-lease-1' }
    if (method === 'listSessions') {
      return { sessions: [], issues: [], managedServiceEndpoints: [] }
    }
    if (method === 'beginApplicationDetach') return { releaseId: 'application-release-1' }
    if (method === 'startProcess') return { processId: 4242 }
    if (method === 'readWorkingDirectory') return null
    if (method === 'awaitApplicationDetach') setTimeout(() => socket.end(), 0)
    if (method === 'detachApplication') setTimeout(() => socket.end(), 0)
    return undefined
  }
}

interface Deferred {
  readonly promise: Promise<void>
  resolve(): void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}
