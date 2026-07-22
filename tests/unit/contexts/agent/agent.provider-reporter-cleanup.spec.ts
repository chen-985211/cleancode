import type { Server } from 'node:http'

const http = vi.hoisted(() => ({ createServer: vi.fn() }))

vi.mock('node:http', () => ({ ...http, default: http }))

import { ClaudeCodeHookReporter } from '../../../../src/contexts/agent/infrastructure/providers/claude-code/ClaudeCodeHookReporter'
import { CodexThreadIdentityReporter } from '../../../../src/contexts/agent/infrastructure/pty/CodexThreadIdentityReporter'

describe('Agent Provider reporter setup cleanup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('closes the Claude Code Hook server when listening fails', async () => {
    const listenFailure = new Error('Claude reporter listen failed')
    const server = new FailingHttpServer(listenFailure)
    http.createServer.mockReturnValue(server.asServer())

    await expect(
      ClaudeCodeHookReporter.start({
        onActivityChanged: () => undefined,
        onSessionIdentified: () => undefined,
        workspaceDirectory: '/repo/app'
      })
    ).rejects.toBe(listenFailure)

    expect(server.close).toHaveBeenCalledTimes(1)
  })

  it('closes the Codex identity server when listening fails', async () => {
    const listenFailure = new Error('Codex reporter listen failed')
    const server = new FailingHttpServer(listenFailure)
    http.createServer.mockReturnValue(server.asServer())

    await expect(
      CodexThreadIdentityReporter.start({
        onThreadIdentified: () => undefined,
        workspaceDirectory: '/repo/app'
      })
    ).rejects.toBe(listenFailure)

    expect(server.close).toHaveBeenCalledTimes(1)
  })
})

class FailingHttpServer {
  private errorListener: ((error: Error) => void) | null = null
  readonly close = vi.fn(() => this.asServer())

  constructor(private readonly failure: Error) {}

  asServer(): Server {
    return this as unknown as Server
  }

  listen(): Server {
    queueMicrotask(() => this.errorListener?.(this.failure))
    return this.asServer()
  }

  off(eventName: string | symbol, listener: (error: Error) => void): Server {
    if (eventName === 'error' && this.errorListener === listener) this.errorListener = null
    return this.asServer()
  }

  once(eventName: string | symbol, listener: (error: Error) => void): Server {
    if (eventName === 'error') this.errorListener = listener
    return this.asServer()
  }
}
