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
      toolName: 'create_block',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraphWithApiBlock,
      output: { createdBlockId: 'terminal-api', type: 'block_graph' },
      status: 'completed',
      toolCallId: expect.any(String)
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
        projectDirectory: '/tmp/project',
        requiresApproval: false,
        sessionId: 'agent-session-1',
        status: 'started',
        toolName: 'create_block',
        workspaceName: 'main'
      }),
      expect.objectContaining({
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
      toolName: 'create_terminal_group',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraphWithTerminalGroup,
      output: { createdTerminalGroupId: 'terminal-group-dev-test', type: 'block_graph' },
      status: 'completed',
      toolCallId: expect.any(String)
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
      toolCallId: expect.any(String)
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
      toolName: 'delete_terminal_group',
      workspaceName: 'main'
    })

    expect(result).toEqual({
      graph: fakeGraph,
      output: { type: 'block_graph' },
      status: 'completed',
      toolCallId: expect.any(String)
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
    deleteTerminalBlock: vi.fn(async () => fakeGraph),
    deleteTerminalGroup: vi.fn(async () => fakeGraph),
    inspectGraph: vi.fn(async () => fakeGraph),
    updateTerminalBlock: vi.fn(async () => fakeGraph),
    updateTerminalGroup: vi.fn(async () => fakeGraph)
  }
}
