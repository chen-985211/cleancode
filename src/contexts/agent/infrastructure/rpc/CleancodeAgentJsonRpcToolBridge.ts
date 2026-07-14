import {
  agentToolDefinitions,
  cleancodeMcpInstructions,
  isAgentToolName
} from '../../application/dto/AgentToolProtocol'
import type { AgentMcpToolCallCommand } from '../../application/ports/AgentMcpServerPort'
import type { AgentToolExecutionResult } from '../../application/use-cases/ExecuteAgentToolUseCase'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export interface CleancodeAgentJsonRpcToolBridgeInput {
  readonly executeMcpTool: (command: AgentMcpToolCallCommand) => Promise<AgentToolExecutionResult>
  readonly projectDirectory: string
  readonly sessionId: string
  readonly workspaceName: string
}

interface JsonRpcRequest {
  readonly id?: number | string
  readonly jsonrpc: '2.0'
  readonly method: string
  readonly params?: unknown
}

type JsonRpcResponse =
  | {
      readonly id: number | string | null
      readonly jsonrpc: '2.0'
      readonly result: unknown
    }
  | {
      readonly error: {
        readonly code: number
        readonly message: string
      }
      readonly id: number | string | null
      readonly jsonrpc: '2.0'
    }

export class CleancodeAgentJsonRpcToolBridge {
  constructor(private readonly input: CleancodeAgentJsonRpcToolBridgeInput) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (request.method === 'notifications/initialized') {
      return null
    }

    if (request.method === 'initialize') {
      return createResult(request.id, {
        capabilities: { tools: { listChanged: false } },
        instructions: cleancodeMcpInstructions,
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'cleancode-agent-tools', version: '0.1.0' }
      })
    }

    if (request.method === 'tools/list') {
      return createResult(request.id, {
        tools: agentToolDefinitions.map((tool) => ({
          annotations: tool.annotations,
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name
        }))
      })
    }

    if (request.method === 'tools/call') {
      return this.callTool(request)
    }

    return createError(request.id, -32601, `Unknown method: ${request.method}`)
  }

  private async callTool(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = readToolCallParams(request.params)

    if (!params || !isAgentToolName(params.name)) {
      return createError(request.id, -32602, 'Invalid tool call.')
    }

    const result = await this.input.executeMcpTool({
      input: params.arguments,
      sessionId: this.input.sessionId,
      toolName: params.name
    })

    return createResult(request.id, {
      content: [
        {
          text: createToolResultText(params.name, result),
          type: 'text'
        }
      ],
      isError: result.status === 'awaiting_approval' || result.status === 'canceled',
      structuredContent: result
    })
  }
}

function createToolResultText(toolName: AgentToolName, result: AgentToolExecutionResult): string {
  if (result.status === 'awaiting_approval') {
    return `cleancode tool ${toolName} is awaiting UI approval: ${result.approval.summary}`
  }

  if (result.status === 'canceled') {
    const reason =
      result.output.type === 'tool_canceled' ? result.output.reason : 'Tool call was canceled.'

    return `cleancode tool ${toolName} canceled: ${reason}`
  }

  return `cleancode tool ${toolName} completed: ${JSON.stringify({
    graph: {
      blockCount: result.graph.blocks.length,
      terminalGroupCount: result.graph.terminalGroups.length,
      workspaceName: result.graph.workspaceName
    },
    output: result.output,
    toolCallId: result.toolCallId
  })}`
}

function readToolCallParams(value: unknown): {
  readonly arguments: Record<string, unknown>
  readonly name: string
} | null {
  if (!isRecord(value) || typeof value.name !== 'string') {
    return null
  }

  return {
    arguments: isRecord(value.arguments) ? value.arguments : {},
    name: value.name
  }
}

function createResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return {
    id: id ?? null,
    jsonrpc: '2.0',
    result
  }
}

function createError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return {
    error: { code, message },
    id: id ?? null,
    jsonrpc: '2.0'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
