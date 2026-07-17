import { ExecuteAgentToolUseCase } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentAuditRepository } from '../../../../src/contexts/agent/application/ports/AgentAuditRepository'
import type { AgentBlockGraphToolPort } from '../../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort'
import type { AgentAuditRecord } from '../../../../src/contexts/agent/domain/entities/AgentAuditRecord'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

describe('execute agent tool', () => {
  it('executes non-destructive terminal block tools without approval and records an audit entry', async () => {
    const blockGraphTools = createBlockGraphTools()
    vi.mocked(blockGraphTools.createTerminalBlock).mockResolvedValue(fakeGraphWithApiBlock)
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    const result = await executeTool.execute({
      input: {
        description: 'Runs the API server',
        launchCommand: 'pnpm dev:api',
        name: 'API Server',
        position: { x: 320, y: 240 },
        type: 'terminal'
      },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-create',
      toolName: 'create_block',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraphWithApiBlock,
      graphChanged: true,
      output: { createdBlockId: 'terminal-api', type: 'block_graph' },
      status: 'completed',
      toolCallId: 'tool-call-create'
    })
    expect(blockGraphTools.createTerminalBlock).toHaveBeenCalledWith(
      {
        projectDirectory: '/tmp/project',
        workspaceName: 'main'
      },
      {
        description: 'Runs the API server',
        launchCommand: 'pnpm dev:api',
        name: 'API Server',
        position: { x: 320, y: 240 },
        type: 'terminal'
      }
    )
    expect(auditRepository.records).toEqual([
      expect.objectContaining({
        id: 'tool-call-create',
        projectDirectory: '/tmp/project',
        requiresApproval: false,
        sessionId: 'agent-session-1',
        status: 'started',
        toolName: 'create_block',
        workspaceName: 'main'
      }),
      expect.objectContaining({
        id: 'tool-call-create',
        projectDirectory: '/tmp/project',
        requiresApproval: false,
        sessionId: 'agent-session-1',
        status: 'completed',
        toolName: 'create_block',
        workspaceName: 'main'
      })
    ])
  })

  it('returns the created terminal group id for follow-up tool calls', async () => {
    const blockGraphTools = createBlockGraphTools()
    vi.mocked(blockGraphTools.createTerminalGroup).mockResolvedValue(fakeGraphWithTerminalGroup)
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    const result = await executeTool.execute({
      input: {
        memberBlockIds: ['terminal-api', 'terminal-test'],
        name: 'OpenCove: Dev + Test'
      },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-group-create',
      toolName: 'create_terminal_group',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraphWithTerminalGroup,
      graphChanged: true,
      output: { createdTerminalGroupId: 'terminal-group-dev-test', type: 'block_graph' },
      status: 'completed',
      toolCallId: 'tool-call-group-create'
    })
  })

  it('waits for right-panel approval before deleting a terminal block', async () => {
    const blockGraphTools = createBlockGraphTools()
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    const result = await executeTool.execute({
      input: { blockId: 'terminal-1' },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-delete',
      toolName: 'delete_block',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      approval: {
        summary: '删除终端积木 terminal-1',
        target: { blockId: 'terminal-1', kind: 'terminal_block' },
        toolName: 'delete_block'
      },
      status: 'awaiting_approval',
      toolCallId: 'tool-call-delete'
    })
    expect(blockGraphTools.deleteTerminalBlock).not.toHaveBeenCalled()
    expect(auditRepository.records).toEqual([
      expect.objectContaining({
        requiresApproval: true,
        status: 'awaiting_approval',
        toolName: 'delete_block'
      })
    ])
  })

  it('identifies the terminal group targeted by a destructive approval', async () => {
    const executeTool = new ExecuteAgentToolUseCase(
      createBlockGraphTools(),
      new RecordingAgentAuditRepository()
    )

    const result = await executeTool.execute({
      input: { terminalGroupId: 'group-1' },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-group-delete',
      toolName: 'delete_terminal_group',
      workspaceName: 'main'
    })

    expect(result).toMatchObject({
      approval: {
        target: { kind: 'terminal_group', terminalGroupId: 'group-1' },
        toolName: 'delete_terminal_group'
      },
      status: 'awaiting_approval'
    })
  })

  it('executes a destructive terminal group tool after approval', async () => {
    const blockGraphTools = createBlockGraphTools()
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    const result = await executeTool.execute({
      approved: true,
      input: { terminalGroupId: 'group-1' },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-group-delete',
      toolName: 'delete_terminal_group',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraph,
      graphChanged: true,
      output: { type: 'block_graph' },
      status: 'completed',
      toolCallId: 'tool-call-group-delete'
    })
    expect(blockGraphTools.deleteTerminalGroup).toHaveBeenCalledWith(
      {
        projectDirectory: '/tmp/project',
        workspaceName: 'main'
      },
      { terminalGroupId: 'group-1' }
    )
    expect(auditRepository.records).toEqual([
      expect.objectContaining({
        requiresApproval: true,
        status: 'started',
        toolName: 'delete_terminal_group'
      }),
      expect.objectContaining({
        requiresApproval: true,
        status: 'completed',
        toolName: 'delete_terminal_group'
      })
    ])
  })

  it('routes terminal execution config, connection, and workflow plan tools through BlockGraph', async () => {
    const blockGraphTools = createBlockGraphTools()
    vi.mocked(blockGraphTools.connectTerminalBlocks).mockResolvedValue({
      connectionId: 'connection-api-test',
      graph: fakeGraph
    })
    vi.mocked(blockGraphTools.inspectTerminalWorkflowPlan).mockResolvedValue({
      graphId: 'graph-1',
      nodes: [],
      workspaceName: 'main'
    })
    const executeTool = new ExecuteAgentToolUseCase(
      blockGraphTools,
      new RecordingAgentAuditRepository()
    )

    await expect(
      executeTool.execute({
        input: {
          blockId: 'terminal-api',
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
        },
        projectDirectory: '/tmp/project',
        sessionId: 'agent-session-1',
        toolCallId: 'tool-config',
        toolName: 'update_terminal_execution_config',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      graph: fakeGraph,
      graphChanged: true,
      output: { type: 'block_graph' },
      status: 'completed',
      toolCallId: 'tool-config'
    })

    await expect(
      executeTool.execute({
        input: { sourceBlockId: 'terminal-api', targetBlockId: 'terminal-test' },
        projectDirectory: '/tmp/project',
        sessionId: 'agent-session-1',
        toolCallId: 'tool-connect',
        toolName: 'connect_terminal_blocks',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      graphChanged: true,
      output: { connectionId: 'connection-api-test', type: 'block_graph' },
      status: 'completed'
    })

    await expect(
      executeTool.execute({
        input: { scope: { type: 'full' } },
        projectDirectory: '/tmp/project',
        sessionId: 'agent-session-1',
        toolCallId: 'tool-plan',
        toolName: 'inspect_terminal_workflow_plan',
        workspaceName: 'main'
      })
    ).resolves.toEqual({
      graphChanged: false,
      output: {
        plan: { graphId: 'graph-1', nodes: [], workspaceName: 'main' },
        type: 'terminal_workflow_plan'
      },
      status: 'completed',
      toolCallId: 'tool-plan'
    })
  })

  it('waits for approval before disconnecting one terminal dependency', async () => {
    const blockGraphTools = createBlockGraphTools()
    const executeTool = new ExecuteAgentToolUseCase(
      blockGraphTools,
      new RecordingAgentAuditRepository()
    )

    const result = await executeTool.execute({
      input: { connectionId: 'connection-api-test' },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-disconnect',
      toolName: 'disconnect_terminal_blocks',
      workspaceName: 'main'
    })

    expect(result).toMatchObject({
      approval: {
        summary: '断开终端依赖 connection-api-test',
        target: { connectionId: 'connection-api-test', kind: 'terminal_connection' },
        toolName: 'disconnect_terminal_blocks'
      },
      status: 'awaiting_approval',
      toolCallId: 'tool-disconnect'
    })
    expect(blockGraphTools.disconnectTerminalBlocks).not.toHaveBeenCalled()
  })

  it('returns a structured failed result and never reaches BlockGraph for invalid tool input', async () => {
    const blockGraphTools = createBlockGraphTools()
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    await expect(
      executeTool.execute({
        input: { sourceBlockId: 'terminal-api', unexpected: true },
        projectDirectory: '/tmp/project',
        sessionId: 'agent-session-1',
        toolCallId: 'tool-invalid',
        toolName: 'connect_terminal_blocks',
        workspaceName: 'main'
      })
    ).resolves.toMatchObject({
      error: {
        code: 'AGENT_TOOL_INPUT_INVALID',
        isExpected: true
      },
      status: 'failed',
      toolCallId: 'tool-invalid'
    })
    expect(blockGraphTools.connectTerminalBlocks).not.toHaveBeenCalled()
    expect(auditRepository.records).toEqual([
      expect.objectContaining({
        id: 'tool-invalid',
        status: 'failed',
        toolName: 'connect_terminal_blocks'
      })
    ])
  })

  it('keeps a committed graph result authoritative when completion auditing fails', async () => {
    const blockGraphTools = createBlockGraphTools()
    vi.mocked(blockGraphTools.updateTerminalBlock).mockResolvedValue(fakeGraphWithApiBlock)
    const auditRepository: AgentAuditRepository = {
      append: vi.fn(async (record) => {
        if (record.status !== 'started') throw new Error('audit storage unavailable')
      })
    }
    const executeTool = new ExecuteAgentToolUseCase(blockGraphTools, auditRepository)

    await expect(
      executeTool.execute({
        input: { blockId: 'terminal-api', name: 'API Server' },
        projectDirectory: '/tmp/project',
        sessionId: 'agent-session-1',
        toolCallId: 'tool-committed-audit-failed',
        toolName: 'update_block',
        workspaceName: 'main'
      })
    ).resolves.toEqual({
      graph: fakeGraphWithApiBlock,
      graphChanged: true,
      output: { type: 'block_graph' },
      status: 'completed',
      toolCallId: 'tool-committed-audit-failed'
    })
    expect(blockGraphTools.updateTerminalBlock).toHaveBeenCalledOnce()
  })

  it('records cancellation only for a call that is still awaiting approval', async () => {
    const auditRepository = new RecordingAgentAuditRepository()
    const executeTool = new ExecuteAgentToolUseCase(createBlockGraphTools(), auditRepository)
    const command = {
      input: { connectionId: 'connection-api-test' },
      projectDirectory: '/tmp/project',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-canceled',
      toolName: 'disconnect_terminal_blocks' as const,
      workspaceName: 'main'
    }

    await executeTool.execute(command)
    await expect(executeTool.cancel(command, 'User rejected the tool call.')).resolves.toEqual({
      output: { reason: 'User rejected the tool call.', type: 'tool_canceled' },
      status: 'canceled',
      toolCallId: 'tool-canceled'
    })
    expect(auditRepository.records.map((record) => [record.id, record.status])).toEqual([
      ['tool-canceled', 'awaiting_approval'],
      ['tool-canceled', 'canceled']
    ])
  })
})

const fakeGraph: BlockGraphSnapshot = {
  blocks: [],
  id: 'graph-1',
  projectId: 'project-1',
  terminalGroups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceName: 'main'
}

const fakeGraphWithApiBlock: BlockGraphSnapshot = {
  ...fakeGraph,
  blocks: [
    {
      description: 'Runs the API server',
      id: 'terminal-api',
      launchCommand: 'pnpm dev:api',
      name: 'API Server',
      position: { x: 320, y: 240 },
      size: { height: 260, width: 420 },
      type: 'terminal'
    }
  ]
}

const fakeGraphWithTerminalGroup: BlockGraphSnapshot = {
  ...fakeGraph,
  blocks: [
    {
      description: 'Runs the dev server',
      id: 'terminal-api',
      launchCommand: 'pnpm dev',
      name: 'Dev',
      position: { x: 100, y: 100 },
      size: { height: 260, width: 420 },
      type: 'terminal'
    },
    {
      description: 'Runs unit tests',
      id: 'terminal-test',
      launchCommand: 'pnpm test -- --run',
      name: 'Test',
      position: { x: 560, y: 100 },
      size: { height: 260, width: 420 },
      type: 'terminal'
    }
  ],
  terminalGroups: [
    {
      id: 'terminal-group-dev-test',
      isCollapsed: false,
      memberBlockIds: ['terminal-api', 'terminal-test'],
      name: 'OpenCove: Dev + Test',
      position: { x: 80, y: 80 },
      size: { height: 320, width: 920 },
      type: 'terminal-group'
    }
  ]
}

class RecordingAgentAuditRepository implements AgentAuditRepository {
  readonly records: AgentAuditRecord[] = []

  async append(record: AgentAuditRecord): Promise<void> {
    this.records.push(record)
  }
}

function createBlockGraphTools(): AgentBlockGraphToolPort {
  return {
    createTerminalBlock: vi.fn(async () => fakeGraph),
    createTerminalGroup: vi.fn(async () => fakeGraph),
    connectTerminalBlocks: vi.fn(async () => ({ connectionId: 'connection-1', graph: fakeGraph })),
    deleteTerminalBlock: vi.fn(async () => fakeGraph),
    deleteTerminalGroup: vi.fn(async () => fakeGraph),
    disconnectTerminalBlocks: vi.fn(async () => fakeGraph),
    inspectGraph: vi.fn(async () => fakeGraph),
    inspectTerminalWorkflowPlan: vi.fn(async () => ({
      graphId: 'graph-1',
      nodes: [],
      workspaceName: 'main'
    })),
    updateTerminalBlock: vi.fn(async () => fakeGraph),
    updateTerminalExecutionConfig: vi.fn(async () => fakeGraph),
    updateTerminalGroup: vi.fn(async () => fakeGraph)
  }
}
