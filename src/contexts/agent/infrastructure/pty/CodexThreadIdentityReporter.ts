import { randomBytes } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { resolve } from 'node:path'

interface CodexNotification {
  readonly cwd?: unknown
  readonly ['thread-id']?: unknown
  readonly type?: unknown
}

export class CodexThreadIdentityReporter {
  private constructor(
    private readonly server: Server,
    readonly token: string,
    readonly url: string
  ) {}

  static async start(input: {
    readonly onThreadIdentified: (threadId: string) => void
    readonly workspaceDirectory: string
  }): Promise<CodexThreadIdentityReporter> {
    const token = randomBytes(24).toString('hex')
    const expectedWorkspaceDirectory = await resolveRealPath(input.workspaceDirectory)
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end()
        return
      }

      let body = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => {
        body = body.length < 64_000 ? `${body}${chunk}` : body
      })
      request.on('end', () => {
        const notification = parseNotification(body)

        if (
          notification?.type === 'agent-turn-complete' &&
          typeof notification['thread-id'] === 'string' &&
          typeof notification.cwd === 'string'
        ) {
          const threadId = notification['thread-id']
          void resolveRealPath(notification.cwd).then((reportedDirectory) => {
            if (reportedDirectory === expectedWorkspaceDirectory) {
              input.onThreadIdentified(threadId)
            }
          })
        }

        response.writeHead(204).end()
      })
    })

    try {
      await new Promise<void>((resolveListening, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject)
          resolveListening()
        })
      })
    } catch (error) {
      closeAfterFailedStart(server)
      throw error
    }

    const address = server.address()

    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('Unable to start the Codex thread identity reporter.')
    }

    return new CodexThreadIdentityReporter(
      server,
      token,
      `http://127.0.0.1:${address.port}/codex-thread`
    )
  }

  async close(): Promise<void> {
    await new Promise<void>((resolveClosed) => this.server.close(() => resolveClosed()))
  }
}

function closeAfterFailedStart(server: Server): void {
  try {
    server.close()
  } catch {
    // Preserve the startup failure; no reporter handle exists for a later cleanup attempt.
  }
}

async function resolveRealPath(path: string): Promise<string> {
  try {
    return await realpath(path)
  } catch {
    return resolve(path)
  }
}

function parseNotification(body: string): CodexNotification | null {
  try {
    const notification = JSON.parse(body) as CodexNotification
    return typeof notification === 'object' && notification !== null ? notification : null
  } catch {
    return null
  }
}
