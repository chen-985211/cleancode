import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'

import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'

interface GeminiHookPayload {
  readonly cwd?: unknown
  readonly hook_event_name?: unknown
  readonly session_id?: unknown
}

export class GeminiHookReporter implements AgentRuntimeArtifact {
  private constructor(
    private readonly server: Server,
    readonly token: string,
    readonly url: string
  ) {}

  static async start(input: {
    readonly onSessionIdentified: (sessionId: string) => void
    readonly workspaceDirectory: string
  }): Promise<GeminiHookReporter> {
    const token = randomBytes(24).toString('hex')
    const expectedDirectory = await resolveRealPath(input.workspaceDirectory)
    let lastReportedSessionId: string | null = null
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
        if (
          payload &&
          payload.hook_event_name === 'SessionStart' &&
          isUuid(payload.session_id) &&
          typeof payload.cwd === 'string' &&
          (await resolveRealPath(payload.cwd)) === expectedDirectory &&
          payload.session_id !== lastReportedSessionId
        ) {
          lastReportedSessionId = payload.session_id
          input.onSessionIdentified(payload.session_id)
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
      throw new Error('Unable to start the Gemini Hook reporter.')
    }
    return new GeminiHookReporter(server, token, `http://127.0.0.1:${address.port}/gemini-hook`)
  }

  async dispose(): Promise<void> {
    await new Promise<void>((resolveClosed) => this.server.close(() => resolveClosed()))
  }
}

function parsePayload(body: string): GeminiHookPayload | null {
  try {
    const payload = JSON.parse(body) as GeminiHookPayload
    return typeof payload === 'object' && payload !== null ? payload : null
  } catch {
    return null
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

function resolveRealPath(path: string): Promise<string> {
  return realpath(path).catch(() => resolve(path))
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
