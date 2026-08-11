import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'

import type {
  AgentActivityIdentity,
  AgentActivitySignal,
  RecordAgentActivityCommand
} from '../../application/dto/AgentActivityProtocol'

const maximumBodyBytes = 64_000
const gatewayPath = '/agent-activity'

export interface AgentHookGatewayOptions {
  readonly authorize: (identity: AgentActivityIdentity, token: string) => boolean | Promise<boolean>
  readonly onReport: (command: RecordAgentActivityCommand) => void | Promise<void>
}

export class AgentHookGateway {
  private disposalPromise: Promise<void> | null = null
  private readonly sourceRevisions = new Map<string, number>()

  private constructor(
    private readonly server: Server,
    private readonly sockets: Set<Socket>,
    readonly url: string
  ) {}

  static async start(options: AgentHookGatewayOptions): Promise<AgentHookGateway> {
    let gateway: AgentHookGateway | null = null
    const sockets = new Set<Socket>()
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== gatewayPath) {
        response.writeHead(404).end()
        return
      }

      let body = ''
      let bodyBytes = 0
      let bodyTooLarge = false
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        if (bodyTooLarge) return
        bodyBytes += Buffer.byteLength(chunk)
        if (bodyBytes > maximumBodyBytes) {
          bodyTooLarge = true
          body = ''
          response.writeHead(413).end()
          request.destroy()
          return
        }
        body += chunk
      })
      request.on('end', () => {
        void acceptRequest({ body, bodyTooLarge, gateway, options, request, response })
      })
    })
    server.requestTimeout = 5_000
    server.on('connection', (socket) => {
      sockets.add(socket)
      socket.once('close', () => sockets.delete(socket))
    })

    try {
      await listen(server)
    } catch (error) {
      closeAfterFailedStart(server)
      throw error
    }
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Unable to start the Agent hook gateway.')
    }
    gateway = new AgentHookGateway(
      server,
      sockets,
      `http://127.0.0.1:${address.port}${gatewayPath}`
    )
    return gateway
  }

  nextSourceRevision(identity: AgentActivityIdentity): number {
    const key = createIdentityKey(identity)
    const revision = (this.sourceRevisions.get(key) ?? 0) + 1
    this.sourceRevisions.set(key, revision)
    return revision
  }

  releaseIdentity(identity: AgentActivityIdentity): void {
    this.sourceRevisions.delete(createIdentityKey(identity))
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise
    this.disposalPromise = new Promise<void>((resolveClosed) => {
      if (!this.server.listening) {
        resolveClosed()
        return
      }
      this.server.close(() => resolveClosed())
      for (const socket of this.sockets) socket.destroy()
    }).then(() => {
      this.sourceRevisions.clear()
    })
    return this.disposalPromise
  }
}

async function acceptRequest(input: {
  readonly body: string
  readonly bodyTooLarge: boolean
  readonly gateway: AgentHookGateway | null
  readonly options: AgentHookGatewayOptions
  readonly request: IncomingMessage
  readonly response: ServerResponse<IncomingMessage>
}): Promise<void> {
  if (input.bodyTooLarge) {
    if (!input.response.writableEnded) input.response.writeHead(413).end()
    return
  }
  const report = parseReport(input.body)
  if (!report || !input.gateway) {
    input.response.writeHead(400).end()
    return
  }
  const token = readBearerToken(input.request.headers.authorization)
  if (!token || !(await input.options.authorize(report.identity, token))) {
    input.response.writeHead(401).end()
    return
  }

  try {
    await input.options.onReport({
      ...report,
      sourceRevision: input.gateway.nextSourceRevision(report.identity)
    })
  } catch {
    // Telemetry projections must never affect the Provider hook process.
  } finally {
    if (report.signal.type === 'invocation_exited') {
      input.gateway.releaseIdentity(report.identity)
    }
  }
  input.response.writeHead(204).end()
}

function parseReport(
  body: string
): { readonly identity: AgentActivityIdentity; readonly signal: AgentActivitySignal } | null {
  let value: unknown
  try {
    value = JSON.parse(body) as unknown
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const identity = parseIdentity(value.identity)
  const signal = parseSignal(value.signal)
  return identity && signal ? { identity, signal } : null
}

function parseIdentity(value: unknown): AgentActivityIdentity | null {
  if (!isRecord(value) || !isIdentifier(value.providerId) || !isIdentifier(value.invocationId)) {
    return null
  }
  const terminal = parseTerminal(value.terminal)
  if (!terminal) return null
  const managed = value.managed === undefined ? undefined : parseManagedIdentity(value.managed)
  if (value.managed !== undefined && !managed) return null
  return {
    invocationId: value.invocationId,
    ...(managed ? { managed } : {}),
    providerId: value.providerId,
    terminal
  }
}

function parseTerminal(value: unknown): AgentActivityIdentity['terminal'] | null {
  if (!isRecord(value)) return null
  const requiredStrings = [
    'blockId',
    'projectDirectory',
    'projectId',
    'runId',
    'sessionId',
    'workspaceDirectory',
    'workspaceId'
  ] as const
  if (requiredStrings.some((field) => !isIdentifier(value[field]))) return null
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) <= 0) return null
  if (
    value.gitBranch !== null &&
    value.gitBranch !== undefined &&
    typeof value.gitBranch !== 'string'
  ) {
    return null
  }
  const owner = value.owner === undefined ? undefined : parseOwner(value.owner)
  if (value.owner !== undefined && !owner) return null
  return {
    blockId: value.blockId as string,
    generation: value.generation as number,
    gitBranch: typeof value.gitBranch === 'string' ? value.gitBranch : null,
    ...(owner ? { owner } : {}),
    projectDirectory: value.projectDirectory as string,
    projectId: value.projectId as string,
    runId: value.runId as string,
    sessionId: value.sessionId as string,
    workspaceDirectory: value.workspaceDirectory as string,
    workspaceId: value.workspaceId as string
  }
}

function parseOwner(
  value: unknown
): NonNullable<AgentActivityIdentity['terminal']['owner']> | null {
  if (!isRecord(value) || !isIdentifier(value.id)) return null
  return value.kind === 'agent' || value.kind === 'block'
    ? { id: value.id, kind: value.kind }
    : null
}

function parseManagedIdentity(
  value: unknown
): NonNullable<AgentActivityIdentity['managed']> | null {
  if (
    !isRecord(value) ||
    !isIdentifier(value.agentId) ||
    (value.agentName !== undefined && !isIdentifier(value.agentName)) ||
    !isIdentifier(value.agentSessionId) ||
    !Number.isSafeInteger(value.providerLaunchGeneration) ||
    Number(value.providerLaunchGeneration) <= 0
  ) {
    return null
  }
  return {
    agentId: value.agentId,
    ...(typeof value.agentName === 'string' ? { agentName: value.agentName } : {}),
    agentSessionId: value.agentSessionId,
    providerLaunchGeneration: value.providerLaunchGeneration as number
  }
}

function parseSignal(value: unknown): AgentActivitySignal | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'turn_completed' || value.type === 'invocation_exited') {
    return { type: value.type }
  }
  if (value.type !== 'status_changed' || !isActivityStatus(value.status)) return null
  return { status: value.status, type: 'status_changed' }
}

function isActivityStatus(
  value: unknown
): value is Extract<AgentActivitySignal, { type: 'status_changed' }>['status'] {
  return (
    value === 'idle' ||
    value === 'unavailable' ||
    value === 'waiting_approval' ||
    value === 'waiting_input' ||
    value === 'working'
  )
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4_096
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBearerToken(value: string | undefined): string | null {
  return value?.startsWith('Bearer ') && value.length > 7 ? value.slice(7) : null
}

function createIdentityKey(identity: AgentActivityIdentity): string {
  return JSON.stringify([
    identity.terminal.sessionId,
    identity.terminal.runId,
    identity.terminal.generation,
    identity.providerId,
    identity.invocationId,
    identity.managed?.agentId ?? null,
    identity.managed?.agentSessionId ?? null,
    identity.managed?.providerLaunchGeneration ?? null
  ])
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolveListening()
    })
  })
}

function closeAfterFailedStart(server: Server): void {
  try {
    server.close()
  } catch {
    // Preserve the startup failure because there is no gateway handle to dispose later.
  }
}
