import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'

import type { AgentActivityStatus } from '../../../application/dto/AgentSessionProtocol'
import type { AgentRuntimeArtifact } from '../../../application/ports/AgentProviderContribution'

interface ClaudeCodeHookPayload {
  readonly cwd?: unknown
  readonly hook_event_name?: unknown
  readonly notification_type?: unknown
  readonly session_id?: unknown
}

export class ClaudeCodeHookReporter implements AgentRuntimeArtifact {
  private constructor(
    private readonly server: Server,
    readonly token: string,
    readonly url: string
  ) {}

  static async start(input: {
    readonly onActivityChanged: (activity: AgentActivityStatus) => void
    readonly onSessionIdentified: (sessionId: string) => void
    readonly workspaceDirectory: string
  }): Promise<ClaudeCodeHookReporter> {
    const token = randomBytes(24).toString('hex')
    const expectedDirectory = await resolveRealPath(input.workspaceDirectory)
    const reportedSessionIds = new Set<string>()
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end()
        return
      }
      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        if (body.length < 64_000) body += chunk
      })
      request.on('end', async () => {
        const payload = parsePayload(body)
        if (payload) {
          await acceptPayload(payload, expectedDirectory, {
            ...input,
            onSessionIdentified: (sessionId) => {
              if (reportedSessionIds.has(sessionId)) return
              reportedSessionIds.add(sessionId)
              input.onSessionIdentified(sessionId)
            }
          })
        }
        response.writeHead(204).end()
      })
    })
    await listen(server)
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Unable to start the Claude Code Hook reporter.')
    }
    return new ClaudeCodeHookReporter(server, token, `http://127.0.0.1:${address.port}/claude-hook`)
  }

  async dispose(): Promise<void> {
    await new Promise<void>((resolveClosed) => this.server.close(() => resolveClosed()))
  }
}

async function acceptPayload(
  payload: ClaudeCodeHookPayload,
  expectedDirectory: string,
  input: {
    readonly onActivityChanged: (activity: AgentActivityStatus) => void
    readonly onSessionIdentified: (sessionId: string) => void
  }
): Promise<void> {
  if (
    typeof payload.cwd !== 'string' ||
    (await resolveRealPath(payload.cwd)) !== expectedDirectory ||
    typeof payload.hook_event_name !== 'string'
  ) {
    return
  }
  if (payload.hook_event_name === 'SessionStart') {
    input.onActivityChanged('idle')
    return
  }
  if (payload.hook_event_name === 'UserPromptSubmit' && isUuid(payload.session_id)) {
    input.onSessionIdentified(payload.session_id)
  }
  const activity = mapActivity(payload)
  if (activity) input.onActivityChanged(activity)
}

function mapActivity(payload: ClaudeCodeHookPayload): AgentActivityStatus | null {
  if (payload.hook_event_name === 'UserPromptSubmit') return 'working'
  if (payload.hook_event_name === 'PermissionRequest') return 'waiting_approval'
  if (payload.hook_event_name === 'Stop') return 'idle'
  if (payload.hook_event_name === 'SessionEnd') return 'unavailable'
  if (payload.hook_event_name !== 'Notification') return null
  if (payload.notification_type === 'permission_prompt') return 'waiting_approval'
  if (payload.notification_type === 'idle_prompt') return 'waiting_input'
  return null
}

function parsePayload(body: string): ClaudeCodeHookPayload | null {
  try {
    const payload = JSON.parse(body) as ClaudeCodeHookPayload
    return typeof payload === 'object' && payload !== null ? payload : null
  } catch {
    return null
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
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
