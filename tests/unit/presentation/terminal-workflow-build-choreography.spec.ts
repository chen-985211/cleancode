import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createTerminalWorkflowBuildChoreography,
  resolveTerminalWorkflowBuildOrigin
} from '../../../src/presentation/app-shell/terminalWorkflowBuildChoreography'

describe('terminal workflow build choreography', () => {
  it('launches dependency layers in parallel within a bounded window', () => {
    const graph = createGraph(20)
    const choreography = createTerminalWorkflowBuildChoreography({
      agentNode: {
        position: { x: 40, y: 100 },
        size: { height: 480, width: 520 }
      },
      change: createChange(graph),
      graph,
      reducedMotion: false
    })

    expect(choreography).not.toBeNull()
    expect(choreography!.terminalStages[0]?.delayMs).toBe(0)
    expect(choreography!.terminalStages.at(-1)?.delayMs).toBe(1_400)
    expect(choreography!.terminalStages.every((stage) => stage.durationMs === 760)).toBe(true)
    expect(choreography!.totalDurationMs).toBe(2_160)

    const parallelGraph = createParallelGraph()
    const parallel = createTerminalWorkflowBuildChoreography({
      agentNode: null,
      change: createChange(parallelGraph),
      graph: parallelGraph,
      reducedMotion: false
    })!
    const delayByBlockId = new Map(
      parallel.terminalStages.map((stage) => [stage.blockId, stage.delayMs])
    )

    expect(delayByBlockId.get('terminal-api')).toBe(delayByBlockId.get('terminal-worker'))
    expect(delayByBlockId.get('terminal-web')).toBe(280)
    expect(parallel.connectionStages[0]?.revealAtMs).toBe(540)
  })

  it('lets the final terminals settle before the group closes around them', () => {
    const graph = createParallelGraph()
    const choreography = createTerminalWorkflowBuildChoreography({
      agentNode: null,
      change: { ...createChange(graph), terminalGroupIds: ['group-development'] },
      graph,
      reducedMotion: false
    })!

    expect(choreography.groupStages).toEqual([
      { revealAtMs: 980, terminalGroupId: 'group-development' }
    ])
    expect(choreography.totalDurationMs).toBe(1_280)
  })

  it('starts at the Agent edge nearest the final workflow centroid', () => {
    expect(
      resolveTerminalWorkflowBuildOrigin({
        agent: {
          position: { x: 100, y: 100 },
          size: { height: 400, width: 500 }
        },
        targetCenter: { x: 900, y: 260 }
      })
    ).toEqual({ x: 632, y: 279 })
  })

  it('collapses all movement and staging when reduced motion is requested', () => {
    const graph = createParallelGraph()
    const choreography = createTerminalWorkflowBuildChoreography({
      agentNode: null,
      change: createChange(graph),
      graph,
      reducedMotion: true
    })!

    expect(choreography.reducedMotion).toBe(true)
    expect(choreography.totalDurationMs).toBe(0)
    expect(choreography.terminalStages.every((stage) => stage.delayMs === 0)).toBe(true)
    expect(choreography.terminalStages.every((stage) => stage.durationMs === 0)).toBe(true)
    expect(choreography.connectionStages.every((stage) => stage.revealAtMs === 0)).toBe(true)
  })
})

function createGraph(count: number): BlockGraphSnapshot {
  const blocks = Array.from({ length: count }, (_, index) => ({
    description: '',
    id: `terminal-${index}`,
    launchCommand: `pnpm task:${index}`,
    name: `Terminal ${index}`,
    position: { x: 760 + index * 24, y: 80 + index * 330 },
    size: { height: 280, width: 420 },
    type: 'terminal' as const
  }))
  return {
    blocks,
    connections: blocks.slice(1).map((block, index) => ({
      id: `connection-${index}`,
      sourceBlockId: blocks[index]!.id,
      targetBlockId: block.id
    })),
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createParallelGraph(): BlockGraphSnapshot {
  const graph = createGraph(3)
  return {
    ...graph,
    blocks: [
      { ...graph.blocks[0]!, id: 'terminal-api' },
      { ...graph.blocks[1]!, id: 'terminal-worker' },
      { ...graph.blocks[2]!, id: 'terminal-web' }
    ],
    connections: [
      {
        id: 'connection-api-web',
        sourceBlockId: 'terminal-api',
        targetBlockId: 'terminal-web'
      }
    ]
  }
}

function createChange(graph: BlockGraphSnapshot): NonNullable<AgentGraphUpdatedEvent['change']> {
  return {
    blockIds: graph.blocks.map((block) => block.id),
    connectionIds: (graph.connections ?? []).map((connection) => connection.id),
    kind: 'terminal_workflow_created',
    operationId: 'workflow-operation-1',
    terminalGroupIds: []
  }
}
