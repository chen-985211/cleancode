import type { AgentBlockGraphToolPort } from '../../../../src/contexts/agent/application/ports/AgentBlockGraphToolPort'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  RecordingAgentAuditRepository,
  createAgent,
  createAgentSessionRepository,
  createExecuteTool
} from './agent.execute-tool-fixtures'

describe('execute Agent layout tools', () => {
  it('uses authoritative workspace Agent layouts when automatically placing a created terminal', async () => {
    const blockGraphTools = createBlockGraphTools()
    vi.mocked(blockGraphTools.createTerminalBlock).mockResolvedValue(fakeGraphWithApiBlock)
    const agentRepository = createAgentSessionRepository([
      createAgent('agent-1', { x: 980, y: 180 }, { height: 460, width: 720 }),
      createAgent('agent-2', { x: 40, y: 80 }, { height: 420, width: 680 })
    ])
    const executeTool = createExecuteTool(
      blockGraphTools,
      new RecordingAgentAuditRepository(),
      agentRepository
    )

    const result = await executeTool.execute({
      agentId: 'agent-1',
      input: {
        description: 'Runs the API server',
        launchCommand: 'pnpm dev:api',
        name: 'API Server',
        type: 'terminal'
      },
      projectDirectory: '/tmp/project',
      projectId: 'project-1',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-auto-create',
      toolName: 'create_block',
      workspaceName: 'main'
    })

    expect(result).toMatchObject({
      graphChanged: true,
      output: { createdBlockId: 'terminal-api', type: 'block_graph' },
      status: 'completed'
    })
    expect(agentRepository.findWorkspace).toHaveBeenCalledWith('project-1', 'main')
    expect(blockGraphTools.createTerminalBlock).toHaveBeenCalledWith(
      { projectDirectory: '/tmp/project', workspaceName: 'main' },
      {
        anchorRegion: {
          position: { x: 980, y: 180 },
          size: { height: 460, width: 720 }
        },
        description: 'Runs the API server',
        launchCommand: 'pnpm dev:api',
        name: 'API Server',
        reservedRegions: [
          {
            position: { x: 40, y: 80 },
            size: { height: 420, width: 680 }
          }
        ],
        type: 'terminal'
      }
    )
  })

  it('arranges only requested blocks and audits a dynamic no-op result', async () => {
    const blockGraphTools = createBlockGraphTools()
    const auditRepository = new RecordingAgentAuditRepository()
    vi.mocked(blockGraphTools.arrangeTerminalLayout).mockResolvedValue({
      arrangedBlockIds: ['terminal-api', 'terminal-test'],
      arrangedTerminalGroupIds: ['terminal-group-dev-test'],
      graph: fakeGraph,
      graphChanged: false
    })
    const executeTool = createExecuteTool(
      blockGraphTools,
      auditRepository,
      createAgentSessionRepository([
        createAgent('agent-1', { x: 980, y: 180 }, { height: 460, width: 720 }),
        createAgent('agent-2', { x: 40, y: 80 }, { height: 420, width: 680 })
      ])
    )

    const result = await executeTool.execute({
      agentId: 'agent-1',
      input: { blockIds: ['terminal-api', 'terminal-test'] },
      projectDirectory: '/tmp/project',
      projectId: 'project-1',
      sessionId: 'agent-session-1',
      toolCallId: 'tool-call-arrange',
      toolName: 'arrange_terminal_layout',
      workspaceName: 'main'
    })

    expect(blockGraphTools.arrangeTerminalLayout).toHaveBeenCalledWith(
      { projectDirectory: '/tmp/project', workspaceName: 'main' },
      {
        anchorRegion: {
          position: { x: 980, y: 180 },
          size: { height: 460, width: 720 }
        },
        blockIds: ['terminal-api', 'terminal-test'],
        reservedRegions: [
          {
            position: { x: 40, y: 80 },
            size: { height: 420, width: 680 }
          }
        ]
      }
    )
    expect(result).toEqual({
      graph: fakeGraph,
      graphChanged: false,
      output: {
        arrangedBlockIds: ['terminal-api', 'terminal-test'],
        arrangedTerminalGroupIds: ['terminal-group-dev-test'],
        type: 'block_graph'
      },
      status: 'completed',
      toolCallId: 'tool-call-arrange'
    })
    expect(
      auditRepository.records.map((record) => ({
        requiresApproval: record.requiresApproval,
        status: record.status,
        toolName: record.toolName
      }))
    ).toEqual([
      {
        requiresApproval: false,
        status: 'started',
        toolName: 'arrange_terminal_layout'
      },
      {
        requiresApproval: false,
        status: 'completed',
        toolName: 'arrange_terminal_layout'
      }
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

function createBlockGraphTools(): AgentBlockGraphToolPort {
  return {
    arrangeTerminalLayout: vi.fn(async () => ({
      arrangedBlockIds: [],
      arrangedTerminalGroupIds: [],
      graph: fakeGraph,
      graphChanged: false
    })),
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
