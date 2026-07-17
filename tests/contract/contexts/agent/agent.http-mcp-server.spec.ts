import type { Server } from 'node:http'

import { CleancodeMcpHttpServer } from '../../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('cleancode HTTP MCP server', () => {
  let server: CleancodeMcpHttpServer

  beforeEach(() => {
    server = new CleancodeMcpHttpServer()
  })

  afterEach(() => {
    server.dispose()
  })

  it('requires the session bearer token', async () => {
    const endpoint = await server.registerSession({
      executeTool: async () => completedToolResult('tool-call-1'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    const response = await fetch(endpoint.url, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })

    expect(response.status).toBe(401)
  })

  it('serves MCP initialize, tools/list, and tools/call over authenticated HTTP JSON-RPC', async () => {
    const executeTool = vi.fn(async () => completedToolResult('tool-call-1'))
    const endpoint = await server.registerSession({
      executeTool,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    await expect(
      postMcp(endpoint, { id: 1, jsonrpc: '2.0', method: 'initialize' })
    ).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'cleancode-agent-tools', version: '0.2.0' }
        })
      })
    )

    const toolsList = await postMcp(endpoint, { id: 2, jsonrpc: '2.0', method: 'tools/list' })
    expect(readToolNames(toolsList)).toEqual([
      'inspect_graph',
      'create_block',
      'update_block',
      'delete_block',
      'create_terminal_group',
      'update_terminal_group',
      'delete_terminal_group',
      'update_terminal_execution_config',
      'connect_terminal_blocks',
      'disconnect_terminal_blocks',
      'inspect_terminal_workflow_plan'
    ])

    await expect(
      postMcp(endpoint, {
        id: 'call-1',
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: {
            name: 'Frontend',
            position: { x: 120, y: 80 },
            type: 'terminal'
          },
          name: 'create_block'
        }
      })
    ).resolves.toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          isError: false,
          structuredContent: expect.objectContaining({ status: 'completed' })
        })
      })
    )
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          name: 'Frontend',
          position: { x: 120, y: 80 },
          type: 'terminal'
        },
        sessionId: 'agent-session-1',
        toolCallId: expect.any(String),
        toolName: 'create_block'
      })
    )
  })

  it('keeps recognized tool execution errors on the HTTP 200 MCP result channel', async () => {
    const endpoint = await server.registerSession({
      executeTool: async () => {
        throw createExpectedAppError(
          'TERMINAL_CONNECTION_DUPLICATE',
          'Terminal connection already exists.'
        )
      },
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    const response = await fetch(endpoint.url, {
      body: JSON.stringify({
        id: 'duplicate',
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          arguments: { sourceBlockId: 'terminal-a', targetBlockId: 'terminal-b' },
          name: 'connect_terminal_blocks'
        }
      }),
      headers: {
        Authorization: `Bearer ${endpoint.bearerToken}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: { code: 'TERMINAL_CONNECTION_DUPLICATE', isExpected: true },
          status: 'failed',
          toolCallId: expect.any(String)
        }
      }
    })
  })

  it('shares one in-flight listen operation across concurrent session registrations', async () => {
    server.dispose()
    const controlledServer = new ControlledHttpServer(43101)
    const createHttpServer = vi.fn(() => controlledServer.asServer())
    server = new CleancodeMcpHttpServer(createHttpServer)

    const firstRegistration = server.registerSession({
      executeTool: async () => completedToolResult('tool-call-1'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })
    const secondRegistration = server.registerSession({
      executeTool: async () => completedToolResult('tool-call-2'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-2',
      workspaceName: 'main'
    })

    await Promise.resolve()
    expect(createHttpServer).toHaveBeenCalledTimes(1)

    controlledServer.succeedListening()
    await expect(Promise.all([firstRegistration, secondRegistration])).resolves.toEqual([
      expect.objectContaining({ url: 'http://127.0.0.1:43101/mcp/agent-session-1' }),
      expect.objectContaining({ url: 'http://127.0.0.1:43101/mcp/agent-session-2' })
    ])
  })

  it('rejects and clears a failed listen operation so registration can retry', async () => {
    server.dispose()
    const failedServer = new ControlledHttpServer(43102)
    const retryServer = new ControlledHttpServer(43103)
    const createHttpServer = vi
      .fn()
      .mockReturnValueOnce(failedServer.asServer())
      .mockReturnValueOnce(retryServer.asServer())
    server = new CleancodeMcpHttpServer(createHttpServer)

    const listenFailure = new Error('address unavailable')
    const firstRegistration = server.registerSession({
      executeTool: async () => completedToolResult('tool-call-1'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    await Promise.resolve()
    failedServer.failListening(listenFailure)

    await expect(settleWithin(firstRegistration, 100)).resolves.toEqual({
      error: listenFailure,
      status: 'rejected'
    })

    const retryRegistration = server.registerSession({
      executeTool: async () => completedToolResult('tool-call-2'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-2',
      workspaceName: 'main'
    })

    await Promise.resolve()
    expect(createHttpServer).toHaveBeenCalledTimes(2)
    retryServer.succeedListening()
    await expect(retryRegistration).resolves.toEqual(
      expect.objectContaining({ url: 'http://127.0.0.1:43103/mcp/agent-session-2' })
    )
  })

  it('returns a stable 400 response for malformed percent-encoded session paths', async () => {
    const endpoint = await server.registerSession({
      executeTool: async () => completedToolResult('tool-call-1'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })
    const origin = new URL(endpoint.url).origin

    const response = await fetch(`${origin}/mcp/%E0%A4%A`, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list' }),
      headers: {
        Authorization: `Bearer ${endpoint.bearerToken}`,
        'Content-Type': 'application/json'
      },
      method: 'POST',
      signal: AbortSignal.timeout(2_000)
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid MCP request.' })
  })

  it('does not expose JSON parsing error details in invalid request responses', async () => {
    const endpoint = await server.registerSession({
      executeTool: async () => completedToolResult('tool-call-1'),
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    const response = await fetch(endpoint.url, {
      body: 'sensitive-request-fragment',
      headers: {
        Authorization: `Bearer ${endpoint.bearerToken}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid MCP request.' })
  })

  it('rejects authenticated MCP request bodies larger than one mebibyte', async () => {
    const executeTool = vi.fn(async () => completedToolResult('tool-call-1'))
    const endpoint = await server.registerSession({
      executeTool,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    const response = await fetch(endpoint.url, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/list',
        params: { padding: 'x'.repeat(1_048_576) }
      }),
      headers: {
        Authorization: `Bearer ${endpoint.bearerToken}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      error: 'MCP request body is too large.'
    })
    expect(executeTool).not.toHaveBeenCalled()
  })
})

interface McpEndpoint {
  readonly bearerToken: string
  readonly url: string
}

async function postMcp(endpoint: McpEndpoint, body: unknown): Promise<unknown> {
  const response = await fetch(endpoint.url, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${endpoint.bearerToken}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })

  return response.json()
}

function readToolNames(response: unknown): string[] {
  if (!isRecord(response) || !isRecord(response.result) || !Array.isArray(response.result.tools)) {
    throw new Error('Expected tools/list result.')
  }

  return response.result.tools.map((tool) => tool.name)
}

function completedToolResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceName: 'main'
    },
    graphChanged: true,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<
  | { readonly status: 'resolved'; readonly value: T }
  | { readonly error: unknown; readonly status: 'rejected' }
  | { readonly status: 'timeout' }
> {
  return Promise.race([
    promise.then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ error, status: 'rejected' as const })
    ),
    new Promise<{ readonly status: 'timeout' }>((resolve) => {
      setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)
    })
  ])
}

class ControlledHttpServer {
  private errorListener: ((...arguments_: unknown[]) => void) | null = null
  private listeningCallback: (() => void) | null = null
  listening = false

  constructor(private readonly port: number) {}

  readonly close = vi.fn(() => {
    this.listening = false
    return this.asServer()
  })

  address(): ReturnType<Server['address']> {
    if (!this.listening) {
      return null
    }

    return { address: '127.0.0.1', family: 'IPv4', port: this.port }
  }

  asServer(): Server {
    return this as unknown as Server
  }

  failListening(error: Error): void {
    const listener = this.errorListener
    this.errorListener = null
    listener?.(error)
  }

  listen(_port: number, _host: string, callback: () => void): Server {
    this.listeningCallback = callback
    return this.asServer()
  }

  off(eventName: string | symbol, listener: (...arguments_: unknown[]) => void): Server {
    if (eventName === 'error' && this.errorListener === listener) {
      this.errorListener = null
    }

    return this.asServer()
  }

  once(eventName: string | symbol, listener: (...arguments_: unknown[]) => void): Server {
    if (eventName === 'error') {
      this.errorListener = listener
    }

    return this.asServer()
  }

  succeedListening(): void {
    this.listening = true
    this.listeningCallback?.()
  }
}
