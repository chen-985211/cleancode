import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

interface CodexNotification {
  readonly cwd?: unknown
  readonly hook_event_name?: unknown
  readonly session_id?: unknown
  readonly ['thread-id']?: unknown
  readonly type?: unknown
}

type CodexThreadIdPrefixResolver = (prefix: string) => Promise<string | null>

export class CodexThreadIdentityReporter {
  private activeThreadPrefix: string | null = null
  private lastEmittedThreadId: string | null = null
  private titleGeneration = 0

  private constructor(
    private readonly server: Server,
    private readonly onThreadIdentified: (threadId: string) => void,
    private readonly onTurnCompleted: () => void,
    private readonly resolveThreadIdPrefix: CodexThreadIdPrefixResolver,
    readonly token: string,
    readonly url: string
  ) {}

  static async start(input: {
    readonly onThreadIdentified: (threadId: string) => void
    readonly onTurnCompleted?: () => void
    readonly resolveThreadIdPrefix?: CodexThreadIdPrefixResolver
  }): Promise<CodexThreadIdentityReporter> {
    const token = randomBytes(24).toString('hex')
    let reporter: CodexThreadIdentityReporter | null = null
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
        const threadId = readCodexThreadId(notification)
        if (threadId) reporter?.acceptReportedThreadId(threadId)
        if (notification?.type === 'agent-turn-complete') reporter?.onTurnCompleted()

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

    reporter = new CodexThreadIdentityReporter(
      server,
      input.onThreadIdentified,
      input.onTurnCompleted ?? (() => undefined),
      input.resolveThreadIdPrefix ?? (async () => null),
      token,
      `http://127.0.0.1:${address.port}/codex-thread`
    )
    return reporter
  }

  acceptTerminalTitle(title: string): void {
    const identity = parseCodexTerminalTitle(title)
    if (!identity) return
    const generation = ++this.titleGeneration
    this.activeThreadPrefix = identity.prefix
    if (identity.threadId) {
      this.emitThreadId(identity.threadId)
      return
    }
    void this.resolveThreadIdPrefix(identity.prefix)
      .then((threadId) => {
        if (
          generation !== this.titleGeneration ||
          !threadId ||
          !isCodexThreadUuid(threadId) ||
          !threadId.startsWith(identity.prefix)
        ) {
          return
        }
        this.emitThreadId(threadId)
      })
      .catch(() => undefined)
  }

  async close(): Promise<void> {
    await new Promise<void>((resolveClosed) => this.server.close(() => resolveClosed()))
  }

  private acceptReportedThreadId(threadId: string): void {
    if (this.activeThreadPrefix && !threadId.startsWith(this.activeThreadPrefix)) return
    this.emitThreadId(threadId)
  }

  private emitThreadId(threadId: string): void {
    if (this.lastEmittedThreadId === threadId) return
    this.lastEmittedThreadId = threadId
    this.onThreadIdentified(threadId)
  }
}

function closeAfterFailedStart(server: Server): void {
  try {
    server.close()
  } catch {
    // Preserve the startup failure; no reporter handle exists for a later cleanup attempt.
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

function readCodexThreadId(notification: CodexNotification | null): string | null {
  if (
    notification?.type === 'agent-turn-complete' &&
    typeof notification['thread-id'] === 'string' &&
    isCodexThreadUuid(notification['thread-id'])
  ) {
    return notification['thread-id']
  }
  if (
    notification?.hook_event_name === 'SessionEnd' &&
    typeof notification.session_id === 'string' &&
    isCodexThreadUuid(notification.session_id)
  ) {
    return notification.session_id
  }
  return null
}

function parseCodexTerminalTitle(
  title: string
): { readonly prefix: string; readonly threadId: string | null } | null {
  if (isCodexThreadUuid(title)) {
    return { prefix: title.slice(0, 29), threadId: title }
  }
  const match =
    /^(.*) \| ([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{5})\.\.\.$/i.exec(
      title
    )
  if (!match) return null
  const threadTitle = match[1]!
  const prefix = match[2]!
  return {
    prefix,
    threadId: isCodexThreadUuid(threadTitle) && threadTitle.startsWith(prefix) ? threadTitle : null
  }
}

function isCodexThreadUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
