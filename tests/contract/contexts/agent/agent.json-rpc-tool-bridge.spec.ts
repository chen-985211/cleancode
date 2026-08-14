import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js'

import { CleancodeAgentJsonRpcToolBridge } from '../../../../src/contexts/agent/infrastructure/rpc/CleancodeAgentJsonRpcToolBridge'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('cleancode agent JSON-RPC tool bridge', () => {
  it('returns cleancode workspace instructions during MCP initialization', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
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
        instructions: expect.stringMatching(/arrange_terminal_layout[\s\S]*preferred/),
        serverInfo: { name: 'cleancode-agent-tools', version: '0.5.0' }
      })
    })
  })

  it('lists all agent tools in MCP tools/list shape', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
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
              required: ['type', 'name'],
              type: 'object'
            }),
            name: 'create_block'
          }),
          expect.objectContaining({
            description: expect.stringContaining('persistent terminal-group space'),
            inputSchema: expect.objectContaining({
              additionalProperties: false,
              properties: expect.objectContaining({
                memberBlockIds: expect.objectContaining({ type: 'array' }),
                name: expect.objectContaining({ type: 'string' }),
                position: expect.objectContaining({ required: ['x', 'y'], type: 'object' })
              }),
              required: ['name'],
              type: 'object'
            }),
            name: 'create_terminal_group'
          }),
          expect.objectContaining({
            description: expect.stringContaining('complete workflow'),
            name: 'move_terminal_workflow_to_group'
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

    expect(result.tools.find((tool) => tool.name === 'inspect_graph')?.annotations).toEqual({
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: true
    })
    expect(result.tools.find((tool) => tool.name === 'create_block')?.annotations).toEqual({
      destructiveHint: false,
      openWorldHint: false,
      readOnlyHint: false
    })
    expect(result.tools.find((tool) => tool.name === 'create_terminal_workflow')).toMatchObject({
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      inputSchema: {
        additionalProperties: false,
        required: ['terminals', 'connections'],
        type: 'object'
      }
    })
    expect(result.tools.find((tool) => tool.name === 'delete_block')?.annotations).toEqual({
      destructiveHint: true,
      openWorldHint: false,
      readOnlyHint: false
    })
    expect(result.tools.find((tool) => tool.name === 'arrange_terminal_layout')).toMatchObject({
      annotations: {
        destructiveHint: false,
        openWorldHint: false,
        readOnlyHint: false
      },
      inputSchema: {
        additionalProperties: false,
        required: ['blockIds'],
        type: 'object'
      }
    })

    expect(result.tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(['list_project_files', 'read_project_file', 'run_shell_command'])
    )
  })

  it('returns a complete tool catalog that conforms to the MCP wire contract', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
    })

    const response = await bridge.handle({
      id: 'protocol-contract',
      jsonrpc: '2.0',
      method: 'tools/list'
    })

    if (!response || !('result' in response)) {
      throw new Error('Expected tools/list result.')
    }
    expect(() => ListToolsResultSchema.parse(response.result)).not.toThrow()
  })

  it('calls agent tools through the application use case', async () => {
    const executeMcpTool = vi.fn(async (command: { readonly toolCallId: string }) => ({
      graph: {
        blocks: [],
        id: 'graph-1',
        projectId: 'project-1',
        terminalGroups: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        workspaceId: 'main'
      },
      graphChanged: true,
      output: {
        type: 'block_graph' as const
      },
      status: 'completed' as const,
      toolCallId: command.toolCallId
    }))
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool,
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
    })

    const response = await bridge.handle({
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

    expect(response).toEqual({
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
          toolCallId: expect.any(String)
        })
      }
    })
    expect(executeMcpTool).toHaveBeenCalledWith(
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
    const command = executeMcpTool.mock.calls[0]?.[0]
    expect(command?.toolCallId).toBe(readStructuredToolCallId(response))
  })

  it('rejects an explicit non-object arguments value before application execution', async () => {
    const executeMcpTool = vi.fn()
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool,
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
    })

    await expect(
      bridge.handle({
        id: 'invalid-call',
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { arguments: null, name: 'inspect_graph' }
      })
    ).resolves.toEqual({
      error: { code: -32602, message: 'Invalid tool call.' },
      id: 'invalid-call',
      jsonrpc: '2.0'
    })
    expect(executeMcpTool).not.toHaveBeenCalled()
  })

  it('returns recognized application errors as HTTP-safe MCP tool failures', async () => {
    const executeMcpTool = vi.fn(async (command: { readonly toolCallId: string }) => {
      expect(command.toolCallId).toEqual(expect.any(String))
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.', {
        blockId: 'terminal-missing'
      })
    })
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool,
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
    })

    const response = await bridge.handle({
      id: 'failed-call',
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { arguments: { blockId: 'terminal-missing' }, name: 'update_block' }
    })

    expect(response).toEqual({
      id: 'failed-call',
      jsonrpc: '2.0',
      result: {
        content: [
          {
            text: expect.stringContaining('TERMINAL_BLOCK_NOT_FOUND'),
            type: 'text'
          }
        ],
        isError: true,
        structuredContent: {
          error: {
            code: 'TERMINAL_BLOCK_NOT_FOUND',
            details: { blockId: 'terminal-missing' },
            isExpected: true,
            message: 'Terminal block was not found.'
          },
          status: 'failed',
          toolCallId: expect.any(String)
        }
      }
    })
    expect(executeMcpTool.mock.calls[0]?.[0].toolCallId).toBe(readStructuredToolCallId(response))
  })

  it('sanitizes unexpected execution failures', async () => {
    const bridge = new CleancodeAgentJsonRpcToolBridge({
      executeMcpTool: vi.fn(async () => {
        throw new Error('secret filesystem path')
      }),
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      workspaceId: 'main'
    })

    const response = await bridge.handle({
      id: 'unexpected-call',
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'inspect_graph' }
    })

    expect(JSON.stringify(response)).not.toContain('secret filesystem path')
    expect(response).toMatchObject({
      result: {
        isError: true,
        structuredContent: {
          error: {
            code: 'UNEXPECTED_ERROR',
            isExpected: false,
            message: 'Unexpected application error.'
          },
          status: 'failed'
        }
      }
    })
  })
})

function readStructuredToolCallId(
  response: Awaited<ReturnType<CleancodeAgentJsonRpcToolBridge['handle']>>
): string {
  if (
    !response ||
    !('result' in response) ||
    !isRecord(response.result) ||
    !isRecord(response.result.structuredContent) ||
    typeof response.result.structuredContent.toolCallId !== 'string'
  ) {
    throw new Error('Expected structured MCP tool result.')
  }

  return response.result.structuredContent.toolCallId
}

function readToolsListResult(
  response: Awaited<ReturnType<CleancodeAgentJsonRpcToolBridge['handle']>>
): {
  readonly tools: readonly {
    readonly annotations?: {
      readonly destructiveHint: boolean
      readonly openWorldHint: boolean
      readonly readOnlyHint: boolean
    }
    readonly name: string
  }[]
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
