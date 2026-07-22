import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse
} from 'node:http'
import { randomBytes } from 'node:crypto'

import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../application/ports/AgentMcpServerPort'
import { CleancodeAgentJsonRpcToolBridge } from '../rpc/CleancodeAgentJsonRpcToolBridge'

const maximumMcpRequestBodyBytes = 1_048_576

export class CleancodeMcpHttpServer implements AgentMcpServerPort {
  private readonly sessions = new Map<string, RegisteredHttpMcpSession>()
  private listeningPromise: Promise<void> | null = null
  private server: Server | null = null

  constructor(
    private readonly createHttpServer: (requestListener: RequestListener) => Server = (
      requestListener
    ) => createServer(requestListener)
  ) {}

  async registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    await this.ensureListening()

    const bearerToken = createBearerToken()
    const registeredSession: RegisteredHttpMcpSession = {
      active: true,
      bearerToken,
      bridge: new CleancodeAgentJsonRpcToolBridge({
        executeMcpTool: session.executeTool,
        onInitialized: () => {
          if (registeredSession.active) session.onInitialized?.()
        },
        projectDirectory: session.projectDirectory,
        sessionId: session.sessionId,
        workspaceName: session.workspaceName
      }),
      session
    }

    this.deactivateSession(session.sessionId)
    this.sessions.set(session.sessionId, registeredSession)

    return {
      bearerToken,
      dispose: () => this.deactivateRegistration(session.sessionId, registeredSession),
      url: `${this.baseUrl()}/mcp/${encodeURIComponent(session.sessionId)}`
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.active = false
    this.sessions.clear()
    this.server?.close()
    this.server = null
  }

  private ensureListening(): Promise<void> {
    if (this.server?.listening) {
      return Promise.resolve()
    }

    if (this.listeningPromise) {
      return this.listeningPromise
    }

    const server = this.createHttpServer((request, response) => {
      void this.handleRequest(request, response)
    })
    this.server = server

    const listeningPromise = this.startListening(server)
    this.listeningPromise = listeningPromise
    const clearListeningPromise = (): void => {
      if (this.listeningPromise === listeningPromise) {
        this.listeningPromise = null
      }
    }

    void listeningPromise.then(clearListeningPromise, clearListeningPromise)
    return listeningPromise
  }

  private async startListening(server: Server): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const stopWaitingForListenError = (): void => {
          server.off('error', handleListenError)
        }
        const handleListenError = (error: Error): void => {
          stopWaitingForListenError()
          reject(error)
        }
        const handleListening = (): void => {
          stopWaitingForListenError()
          resolve()
        }

        server.once('error', handleListenError)

        try {
          server.listen(0, '127.0.0.1', handleListening)
        } catch (error) {
          stopWaitingForListenError()
          reject(error)
        }
      })
    } catch (error) {
      if (this.server === server) {
        this.server = null
      }

      throw error
    }
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    try {
      const session = this.findSession(request.url ?? '')

      if (!session) {
        writeJson(response, 404, { error: 'MCP session not found.' })
        return
      }

      if (!isAuthorized(request, session.bearerToken)) {
        writeJson(response, 401, { error: 'Unauthorized.' })
        return
      }

      const body = await readJsonBody(request)

      if (!isJsonRpcRequest(body)) {
        writeJson(response, 400, { error: 'Invalid JSON-RPC request.' })
        return
      }

      if (!session.active) {
        writeJson(response, 404, { error: 'MCP session not found.' })
        return
      }

      const result = await session.bridge.handle(body)

      if (result === null) {
        response.statusCode = 202
        response.end()
        return
      }

      writeJson(response, 200, result)
    } catch (error) {
      if (error instanceof McpRequestBodyTooLargeError) {
        writeJson(response, 413, { error: 'MCP request body is too large.' })
        return
      }

      writeJson(response, 400, { error: 'Invalid MCP request.' })
    }
  }

  private findSession(url: string): RegisteredHttpMcpSession | null {
    const match = /^\/mcp\/([^/?#]+)/.exec(url)

    if (!match) {
      return null
    }

    return this.sessions.get(decodeURIComponent(match[1] ?? '')) ?? null
  }

  private baseUrl(): string {
    const address = this.server?.address()

    if (!address || typeof address === 'string') {
      throw new Error('MCP server is not listening.')
    }

    return `http://127.0.0.1:${address.port}`
  }

  private deactivateRegistration(sessionId: string, registration: RegisteredHttpMcpSession): void {
    registration.active = false
    if (this.sessions.get(sessionId) === registration) this.sessions.delete(sessionId)
  }

  private deactivateSession(sessionId: string): void {
    const registration = this.sessions.get(sessionId)
    if (!registration) return
    this.deactivateRegistration(sessionId, registration)
  }
}

interface RegisteredHttpMcpSession {
  active: boolean
  readonly bearerToken: string
  readonly bridge: CleancodeAgentJsonRpcToolBridge
  readonly session: RegisteredAgentMcpSession
}

function isAuthorized(request: IncomingMessage, bearerToken: string): boolean {
  return request.headers.authorization === `Bearer ${bearerToken}`
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    let bodyBytes = 0
    let isSettled = false

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      if (isSettled) return
      bodyBytes += Buffer.byteLength(chunk, 'utf8')
      if (bodyBytes > maximumMcpRequestBodyBytes) {
        isSettled = true
        reject(new McpRequestBodyTooLargeError())
        return
      }
      body += chunk
    })
    request.on('end', () => {
      if (isSettled) return
      isSettled = true
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', (error) => {
      if (isSettled) return
      isSettled = true
      reject(error)
    })
  })
}

class McpRequestBodyTooLargeError extends Error {}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(body))
}

function createBearerToken(): string {
  return randomBytes(24).toString('base64url')
}

function isJsonRpcRequest(value: unknown): value is {
  readonly id?: number | string
  readonly jsonrpc: '2.0'
  readonly method: string
  readonly params?: unknown
} {
  return (
    isRecord(value) &&
    value.jsonrpc === '2.0' &&
    typeof value.method === 'string' &&
    (value.id === undefined || typeof value.id === 'number' || typeof value.id === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
