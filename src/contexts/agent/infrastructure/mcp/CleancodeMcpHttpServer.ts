import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'

import type {
  AgentMcpEndpoint,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../application/ports/AgentMcpServerPort'
import { CleancodeAgentJsonRpcToolBridge } from '../rpc/CleancodeAgentJsonRpcToolBridge'

export class CleancodeMcpHttpServer implements AgentMcpServerPort {
  private readonly sessions = new Map<string, RegisteredHttpMcpSession>()
  private server: Server | null = null

  async registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpEndpoint> {
    await this.ensureListening()

    const bearerToken = createBearerToken()
    const registeredSession = {
      bridge: new CleancodeAgentJsonRpcToolBridge({
        executeMcpTool: session.executeTool,
        projectDirectory: session.projectDirectory,
        sessionId: session.sessionId,
        workspaceName: session.workspaceName
      }),
      bearerToken,
      session
    }

    this.sessions.set(session.sessionId, registeredSession)

    return {
      bearerToken,
      url: `${this.baseUrl()}/mcp/${encodeURIComponent(session.sessionId)}`
    }
  }

  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  dispose(): void {
    this.sessions.clear()
    this.server?.close()
    this.server = null
  }

  private async ensureListening(): Promise<void> {
    if (this.server?.listening) {
      return
    }

    this.server = createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    await new Promise<void>((resolve) => {
      this.server?.listen(0, '127.0.0.1', resolve)
    })
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method not allowed.' })
      return
    }

    const session = this.findSession(request.url ?? '')

    if (!session) {
      writeJson(response, 404, { error: 'MCP session not found.' })
      return
    }

    if (!isAuthorized(request, session.bearerToken)) {
      writeJson(response, 401, { error: 'Unauthorized.' })
      return
    }

    try {
      const body = await readJsonBody(request)

      if (!isJsonRpcRequest(body)) {
        writeJson(response, 400, { error: 'Invalid JSON-RPC request.' })
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
      writeJson(response, 400, {
        error: error instanceof Error ? error.message : 'Invalid MCP request.'
      })
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
}

interface RegisteredHttpMcpSession {
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

    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

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
