import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { CleancodeMcpHttpServer } from '../../../../src/contexts/agent/infrastructure/mcp/CleancodeMcpHttpServer'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'

describe('Agent MCP soft-timeout lifecycle', () => {
  it('keeps the real HTTP endpoint available for a late initialize handshake', async () => {
    vi.useFakeTimers()
    const mcpServer = new CleancodeMcpHttpServer()
    const providers = new RecordingAgentProviderRegistry()
    const service = new AgentSessionService(
      new RecordingAgentTerminalRuntime(),
      mcpServer,
      { cancel: vi.fn(), execute: vi.fn(async () => completedToolResult()) },
      emptyRepository,
      providers,
      'codex'
    )

    try {
      await service.attach(attachCommand())
      const endpoint = providers.launchCommands[0]?.cleancodeMcp
      expect(endpoint).toBeDefined()

      await vi.advanceTimersByTimeAsync(30_000)
      expect((await service.attach(attachCommand())).runtime.mcp.status).toBe('degraded')

      vi.useRealTimers()
      await expect(
        sendMcp(endpoint!, { id: 1, jsonrpc: '2.0', method: 'initialize' })
      ).resolves.toMatchObject({ status: 200 })
      await expect(
        sendMcp(endpoint!, { jsonrpc: '2.0', method: 'notifications/initialized' })
      ).resolves.toMatchObject({ status: 202 })

      expect((await service.attach(attachCommand())).runtime.mcp.status).toBe('ready')
    } finally {
      vi.useRealTimers()
      mcpServer.dispose()
    }
  })
})

const emptyRepository: AgentSessionRepository = {
  delete: () => Promise.resolve(),
  deleteAgent: () => Promise.resolve(),
  deleteProject: () => Promise.resolve(),
  find: () => Promise.resolve(null),
  findAgent: () => Promise.resolve(null),
  findWorkspace: () => Promise.resolve([]),
  save: () => Promise.resolve()
}

function attachCommand() {
  return {
    agentId: 'agent-1',
    onGraphUpdated: vi.fn(),
    onRuntimeChanged: vi.fn(),
    onToolApprovalRequested: vi.fn(),
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}

function sendMcp(
  endpoint: { readonly bearerToken: string; readonly serverUrl: string },
  body: unknown
): Promise<Response> {
  return fetch(endpoint.serverUrl, {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${endpoint.bearerToken}`,
      'Content-Type': 'application/json'
    },
    method: 'POST'
  })
}

function completedToolResult(): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'main'
    },
    graphChanged: false,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId: 'tool-call-1'
  }
}
