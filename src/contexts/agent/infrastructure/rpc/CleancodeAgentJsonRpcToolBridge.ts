import {
  agentToolDefinitions,
  cleancodeMcpInstructions,
  isAgentToolName
} from '../../application/dto/AgentToolProtocol'
import { createAgentToolFailedResult } from '../../application/dto/AgentToolFailure'
import type { AgentMcpToolCallCommand } from '../../application/ports/AgentMcpServerPort'
import type { AgentToolExecutionResult } from '../../application/use-cases/ExecuteAgentToolUseCase'
import type { AgentToolName } from '../../domain/value-objects/AgentToolName'

export interface CleancodeAgentJsonRpcToolBridgeInput {
  readonly executeMcpTool: (command: AgentMcpToolCallCommand) => Promise<AgentToolExecutionResult>
  readonly onInitialized?: () => void
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
      readonly error: { readonly code: number; readonly message: string }
      readonly id: number | string | null
      readonly jsonrpc: '2.0'
    }

export class CleancodeAgentJsonRpcToolBridge {
  private initializeAccepted = false
  private initializedPublished = false

  constructor(private readonly input: CleancodeAgentJsonRpcToolBridgeInput) {}

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    if (request.method === 'notifications/initialized') {
      if (this.initializeAccepted && !this.initializedPublished) {
        this.initializedPublished = true
        this.input.onInitialized?.()
      }
      return null
    }

    if (request.method === 'initialize') {
      this.initializeAccepted = true
      return createResult(request.id, {
        capabilities: { tools: { listChanged: false } },
        instructions: cleancodeMcpInstructions,
        protocolVersion: '2025-06-18',
        serverInfo: { name: 'cleancode-agent-tools', version: '0.3.1' }
      })
    }

    if (request.method === 'tools/list') {
      return createResult(request.id, {
        tools: agentToolDefinitions.map((tool) => ({
          annotations: tool.annotations,
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name,
          outputSchema: tool.outputSchema
        }))
      })
    }

    if (request.method === 'tools/call') return this.callTool(request)
    return createError(request.id, -32601, `Unknown method: ${request.method}`)
  }

  private async callTool(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = readToolCallParams(request.params)
    if (!params || !isAgentToolName(params.name)) {
      return createError(request.id, -32602, 'Invalid tool call.')
    }

    const toolCallId = createAgentToolCallId()
    let result: AgentToolExecutionResult

    try {
      result = await this.input.executeMcpTool({
        input: params.arguments,
        sessionId: this.input.sessionId,
        toolCallId,
        toolName: params.name
      })
    } catch (error) {
      result = createAgentToolFailedResult(toolCallId, error)
    }

    return createResult(request.id, {
      content: [{ text: createToolResultText(params.name, result), type: 'text' }],
      isError:
        result.status === 'awaiting_approval' ||
        result.status === 'canceled' ||
        result.status === 'failed',
      structuredContent: result
    })
  }
}

function createToolResultText(toolName: AgentToolName, result: AgentToolExecutionResult): string {
  if (result.status === 'awaiting_approval') {
    return `cleancode tool ${toolName} is awaiting UI approval: ${result.approval.summary}`
  }
  if (result.status === 'canceled') {
    return `cleancode tool ${toolName} canceled: ${result.output.reason}`
  }
  if (result.status === 'failed') {
    return `cleancode tool ${toolName} failed [${result.error.code}]: ${result.error.message}`
  }
  if (result.output.type === 'terminal_workflow_plan') {
    return `cleancode tool ${toolName} completed: ${JSON.stringify({
      graphId: result.output.plan.graphId,
      nodeCount: result.output.plan.nodes.length,
      toolCallId: result.toolCallId,
      workspaceName: result.output.plan.workspaceName
    })}`
  }

  if (!('graph' in result)) {
    return `cleancode tool ${toolName} completed.`
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
  if (!isRecord(value) || typeof value.name !== 'string') return null
  if (value.arguments !== undefined && !isRecord(value.arguments)) return null
  return { arguments: value.arguments ?? {}, name: value.name }
}

function createResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { id: id ?? null, jsonrpc: '2.0', result }
}

function createError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { error: { code, message }, id: id ?? null, jsonrpc: '2.0' }
}

function createAgentToolCallId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-tool-${Date.now()}-${Math.random()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
