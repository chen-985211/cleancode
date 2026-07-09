import { CleancodeAgentJsonRpcToolBridge } from '../../../../src/contexts/agent/infrastructure/rpc/CleancodeAgentJsonRpcToolBridge'

describe('cleancode agent JSON-RPC tool bridge', () => {
  it('returns cleancode workspace instructions during MCP initialization', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    await expect(
      bridge.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'initialize'
      })
    ).resolves.toEqual({
      id: 1,
      jsonrpc: '2.0',
      result: expect.objectContaining({
        instructions: expect.stringContaining('terminal blocks'),
        serverInfo: { name: 'cleancode-agent-tools', version: '0.1.0' }
      })
    })
  })

  it('lists all agent tools in MCP tools/list shape', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    await expect(
      bridge.handle({
        id: 1,
        jsonrpc: '2.0',
        method: 'tools/list'
      })
    ).resolves.toEqual({
      id: 1,
      jsonrpc: '2.0',
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            description: expect.stringContaining('cleancode canvas'),
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              properties: expect.objectContaining({
                launchCommand: expect.objectContaining({ type: 'string' }),
                name: expect.objectContaining({ type: 'string' }),
                position: expect.objectContaining({
                  required: ['x', 'y'],
                  type: 'object'
                }),
                type: expect.objectContaining({ const: 'terminal' })
              }),
              required: ['type', 'name', 'position'],
              type: 'object'
            }),
            name: 'create_block'
          }),
          expect.objectContaining({
            description: expect.stringContaining('existing terminal blocks'),
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              properties: expect.objectContaining({
                memberBlockIds: expect.objectContaining({ type: 'array' }),
                name: expect.objectContaining({ type: 'string' })
              }),
              required: ['name', 'memberBlockIds'],
              type: 'object'
            }),
            name: 'create_terminal_group'
          })
        ])
      }
    })
    const response = await bridge.handle({
      id: 2,
      jsonrpc: '2.0',
      method: 'tools/list'
    })
    const result = readToolsListResult(response)

    expect(result.tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(['list_project_files', 'read_project_file', 'run_shell_command'])
    )
  })

  it('calls agent tools through the application use case', async () => {
    const executeMcpTool = vi.fn(async () => ({
      graph: {
        blocks: [],
        id: 'graph-1',
        projectId: 'project-1',
        terminalGroups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        workspaceName: 'main'
      },
      output: {
        type: 'block_graph' as const
      },
      status: 'completed' as const,
      toolCallId: 'tool-call-1'
    }))
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool,
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceName: 'main'
    })

    await expect(
      bridge.handle({
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
    ).resolves.toEqual({
      id: 'call-1',
      jsonrpc: '2.0',
      result: {
        content: [
          {
            text: expect.stringContaining('cleancode tool create_block completed'),
            type: 'text'
          }
        ],
        isError: false,
        structuredContent: expect.objectContaining({
          status: 'completed',
          toolCallId: 'tool-call-1'
        })
      }
    })
    expect(executeMcpTool).toHaveBeenCalledWith({
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

function readToolsListResult(
  response: Awaited<ReturnType<CleancodeAgentJsonRpcToolBridge['handle']>>
): {
  readonly tools: readonly { readonly name: string }[]
} {
  if (!response || !('result' in response) || !isToolsListResult(response.result)) {
    throw new Error('Expected tools/list result.')
  }

  return response.result
}

function isToolsListResult(
  value: unknown
): value is { readonly tools: readonly { readonly name: string }[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { readonly tools?: unknown }).tools)
  )
}
