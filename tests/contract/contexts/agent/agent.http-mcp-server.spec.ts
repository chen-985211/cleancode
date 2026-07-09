import { CleancodeMcpHttpServer } from '../../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'

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
          serverInfo: { name: 'cleancode-agent-tools', version: '0.1.0' }
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
      'delete_terminal_group'
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
    expect(executeTool).toHaveBeenCalledWith({
      input: {
        name: 'Frontend',
        position: { x: 120, y: 80 },
        type: 'terminal'
      },
      sessionId: 'agent-session-1',
      toolName: 'create_block'
    })
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
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
