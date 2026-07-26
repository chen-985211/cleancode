import type { AgentMcpServerPort } from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentTerminalRuntimePort } from '../../../../src/contexts/agent/application/ports/AgentTerminalRuntimePort'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'

describe('Agent session tool lifecycle', () => {
  it('closes the endpoint, rejects new calls, and drains an admitted write before disposal', async () => {
    let finishWrite: (result: AgentToolExecutionResult) => void = () => undefined
    const execute = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AgentToolExecutionResult>((resolve) => {
            finishWrite = resolve
          })
      )
      .mockResolvedValue(completedResult('late-tool-call'))
    const processPort = createProcessPort()
    const mcpServer = createMcpServer()
    const service = new AgentSessionService(
      processPort,
      mcpServer,
      { cancel: vi.fn(), execute },
      createSessionRepository(),
      new RecordingAgentProviderRegistry(),
      'codex'
    )
    const session = await service.attach(attachCommand())
    const admittedWrite = service.executeMcpTool({
      input: { sourceBlockId: 'terminal-a', targetBlockId: 'terminal-b' },
      sessionId: session.sessionId,
      toolCallId: 'admitted-tool-call',
      toolName: 'connect_terminal_blocks'
    })
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))

    const disposal = service.disposeAgent({
      agentId: 'agent-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    await vi.waitFor(() => expect(mcpServer.disposedSessionIds).toContain(session.sessionId))

    expect(processPort.stop).not.toHaveBeenCalled()
    await expect(
      service.executeMcpTool({
        input: {},
        sessionId: session.sessionId,
        toolCallId: 'late-tool-call',
        toolName: 'inspect_graph'
      })
    ).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })
    expect(execute).toHaveBeenCalledTimes(1)

    finishWrite(completedResult('admitted-tool-call'))
    await expect(admittedWrite).resolves.toMatchObject({ status: 'completed' })
    const lease = await disposal
    lease.release()
    expect(processPort.stop).toHaveBeenCalledWith(session.sessionId)
  })

  it('restores the original MCP endpoint and gate when reconfiguration cannot stop the PTY', async () => {
    const processPort = createProcessPort()
    const mcpServer = createMcpServer()
    const execute = vi.fn(async (command: { readonly toolCallId: string }) =>
      completedResult(command.toolCallId)
    )
    const service = new AgentSessionService(
      processPort,
      mcpServer,
      { cancel: vi.fn(), execute },
      createSessionRepository(),
      new RecordingAgentProviderRegistry(),
      'codex'
    )
    const session = await service.attach(attachCommand())
    processPort.stop.mockRejectedValueOnce(new Error('PTY stop failed'))

    await expect(
      service.reconfigureAgent({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceId: 'main'
      })
    ).rejects.toThrow('PTY stop failed')

    expect(mcpServer.disposedSessionIds).toEqual([])
    await expect(
      service.executeMcpTool({
        input: {},
        sessionId: session.sessionId,
        toolCallId: 'tool-after-failed-reconfigure',
        toolName: 'inspect_graph'
      })
    ).resolves.toMatchObject({ status: 'completed' })
  })

  it('replays a waiting approval when the renderer reattaches to a running session', async () => {
    const replayedApproval = vi.fn()
    const service = new AgentSessionService(
      createProcessPort(),
      createMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => ({
          output: { reason, type: 'tool_canceled' as const },
          status: 'canceled' as const,
          toolCallId: command.toolCallId
        })),
        execute: vi.fn(async (command) => awaitingApproval(command.toolCallId))
      },
      createSessionRepository(),
      new RecordingAgentProviderRegistry(),
      'codex'
    )
    const session = await service.attach(attachCommand())
    const toolResult = service.executeMcpTool({
      input: { connectionId: 'connection-1' },
      sessionId: session.sessionId,
      toolCallId: 'approval-to-replay',
      toolName: 'disconnect_terminal_blocks'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))

    const reattached = await service.attach({
      ...attachCommand(),
      onToolApprovalRequested: replayedApproval
    })

    expect(reattached.sessionId).toBe(session.sessionId)
    expect(replayedApproval).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId: 'approval-to-replay' })
    )
    await service.rejectTool({ approvalId: 'approval-to-replay' })
    await expect(toolResult).resolves.toMatchObject({ status: 'canceled' })
  })
})

function attachCommand() {
  return {
    agentId: 'agent-1',
    onGraphUpdated: vi.fn(),
    onRuntimeChanged: vi.fn(),
    onToolApprovalRequested: vi.fn(),
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}

function createProcessPort(): AgentTerminalRuntimePort & {
  readonly stop: ReturnType<typeof vi.fn>
} {
  const runtime = new RecordingAgentTerminalRuntime()
  return Object.assign(runtime, { stop: vi.fn(runtime.stop.bind(runtime)) })
}

function createMcpServer(): AgentMcpServerPort & {
  readonly disposedSessionIds: string[]
} {
  const disposedSessionIds: string[] = []
  return {
    disposedSessionIds,
    dispose: vi.fn(),
    registerSession: vi.fn(async (session) => ({
      bearerToken: `token-${session.sessionId}`,
      dispose: vi.fn(() => disposedSessionIds.push(session.sessionId)),
      url: `http://127.0.0.1/mcp/${session.sessionId}`
    }))
  }
}

function createSessionRepository(): AgentSessionRepository {
  return {
    delete: vi.fn(async () => undefined),
    deleteAgent: vi.fn(async () => undefined),
    deleteProject: vi.fn(async () => undefined),
    find: vi.fn(async () => null),
    findAgent: vi.fn(async () => null),
    findWorkspace: vi.fn(async () => []),
    save: vi.fn(async () => undefined)
  }
}

function completedResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'main'
    },
    graphChanged: true,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}

function awaitingApproval(toolCallId: string): AgentToolExecutionResult {
  return {
    approval: {
      summary: '断开终端依赖 connection-1',
      target: { connectionId: 'connection-1', kind: 'terminal_connection' },
      toolName: 'disconnect_terminal_blocks'
    },
    status: 'awaiting_approval',
    toolCallId
  }
}
