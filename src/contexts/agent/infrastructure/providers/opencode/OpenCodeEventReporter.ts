import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'

import type { AgentActivityStatus } from '../../../application/dto/AgentSessionProtocol'
import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'

interface OpenCodeEvent {
  readonly properties: Readonly<Record<string, unknown>>
  readonly type: string
}

interface OpenCodeEventPayload {
  readonly directory: string
  readonly event: OpenCodeEvent
}

export class OpenCodeEventReporter implements AgentRuntimeArtifact {
  private disposalPromise: Promise<void> | null = null
  private disposed = false

  private constructor(
    private readonly server: Server,
    readonly token: string,
    readonly url: string
  ) {}

  static async start(input: {
    readonly expectedSessionId?: string
    readonly onActivityChanged: (activity: AgentActivityStatus) => void
    readonly onSessionIdentified: (sessionId: string) => void
    readonly workspaceDirectory: string
  }): Promise<OpenCodeEventReporter> {
    const token = randomBytes(24).toString('hex')
    const expectedDirectory = await resolveRealPath(input.workspaceDirectory)
    const state = createReporterState(input.expectedSessionId)
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end()
        return
      }

      let body = ''
      let bodyTooLarge = false
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        if (bodyTooLarge) return
        if (body.length + chunk.length > 64_000) {
          bodyTooLarge = true
          body = ''
          return
        }
        body += chunk
      })
      request.on('end', async () => {
        if (bodyTooLarge) {
          response.writeHead(413).end()
          return
        }
        const payload = parsePayload(body)
        if (payload) {
          try {
            await acceptPayload(payload, expectedDirectory, state, input)
          } catch {
            // Provider telemetry must never affect the OpenCode event loop.
          }
        }
        response.writeHead(204).end()
      })
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
      throw new Error('Unable to start the OpenCode event reporter.')
    }
    return new OpenCodeEventReporter(
      server,
      token,
      `http://127.0.0.1:${address.port}/opencode-event`
    )
  }

  dispose(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.disposalPromise) return this.disposalPromise

    const disposal = new Promise<void>((resolveClosed) => {
      if (!this.server.listening) {
        resolveClosed()
        return
      }
      this.server.close(() => resolveClosed())
    }).then(() => {
      this.disposed = true
    })
    this.disposalPromise = disposal
    return disposal
  }
}

interface ReporterState {
  activeSessionId: string | null
  readonly reportedSessionIds: Set<string>
}

function createReporterState(expectedSessionId: string | undefined): ReporterState {
  const activeSessionId = isOpenCodeSessionId(expectedSessionId) ? expectedSessionId : null
  return {
    activeSessionId,
    reportedSessionIds: new Set(activeSessionId ? [activeSessionId] : [])
  }
}

async function acceptPayload(
  payload: OpenCodeEventPayload,
  expectedDirectory: string,
  state: ReporterState,
  callbacks: {
    readonly onActivityChanged: (activity: AgentActivityStatus) => void
    readonly onSessionIdentified: (sessionId: string) => void
  }
): Promise<void> {
  if ((await resolveRealPath(payload.directory)) !== expectedDirectory) return

  if (payload.event.type === 'session.created') {
    const info = payload.event.properties.info
    if (!isRecord(info) || info.parentID !== undefined || !isOpenCodeSessionId(info.id)) return
    if (
      typeof info.directory !== 'string' ||
      (await resolveRealPath(info.directory)) !== expectedDirectory
    ) {
      return
    }
    state.activeSessionId = info.id
    if (!state.reportedSessionIds.has(info.id)) {
      state.reportedSessionIds.add(info.id)
      callbacks.onSessionIdentified(info.id)
    }
    callbacks.onActivityChanged('idle')
    return
  }

  const sessionId = readEventSessionId(payload.event)
  if (!sessionId || sessionId !== state.activeSessionId) return
  const activity = mapActivity(payload.event)
  if (activity) callbacks.onActivityChanged(activity)
  if (payload.event.type === 'session.deleted') state.activeSessionId = null
}

function readEventSessionId(event: OpenCodeEvent): string | null {
  if (typeof event.properties.sessionID === 'string') return event.properties.sessionID
  if (event.type === 'session.deleted') {
    const info = event.properties.info
    if (isRecord(info) && typeof info.id === 'string') return info.id
  }
  return null
}

function mapActivity(event: OpenCodeEvent): AgentActivityStatus | null {
  if (event.type === 'session.idle') return 'idle'
  if (event.type === 'session.error' || event.type === 'session.deleted') return 'unavailable'
  if (event.type === 'permission.asked' || event.type === 'permission.updated') {
    return 'waiting_approval'
  }
  if (event.type === 'permission.replied') return 'working'
  if (event.type === 'question.asked') return 'waiting_input'
  if (event.type === 'question.replied' || event.type === 'question.rejected') return 'working'
  if (event.type !== 'session.status') return null

  const status = event.properties.status
  if (!isRecord(status) || typeof status.type !== 'string') return null
  if (status.type === 'idle') return 'idle'
  if (status.type === 'busy' || status.type === 'retry') return 'working'
  return null
}

function parsePayload(body: string): OpenCodeEventPayload | null {
  let value: unknown
  try {
    value = JSON.parse(body) as unknown
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.directory !== 'string' || !isRecord(value.event)) {
    return null
  }
  if (typeof value.event.type !== 'string' || !isRecord(value.event.properties)) return null
  return {
    directory: value.directory,
    event: {
      properties: value.event.properties,
      type: value.event.type
    }
  }
}

export function isOpenCodeSessionId(value: unknown): value is string {
  return typeof value === 'string' && /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function resolveRealPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
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
    // Preserve the startup failure because there is no reporter handle to clean up later.
  }
}
