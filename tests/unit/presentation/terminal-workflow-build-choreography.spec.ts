import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createTerminalWorkflowBuildChoreography,
  resolveTerminalWorkflowBuildOrigin
} from '../../../src/presentation/app-shell/terminalWorkflowBuildChoreography'

describe('terminal workflow build choreography', () => {
  it('launches every terminal simultaneously without dependency-layer delay', () => {
    const graph = createGraph(20)
    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [
        {
          nodeId: 'agent:agent-1',
          position: { x: 40, y: 100 },
          size: { height: 480, width: 520 }
        }
      ],
      change: createChange(graph),
      graph,
      mode: 'simultaneous',
      originNodeId: 'agent:agent-1',
      reducedMotion: false
    })

    expect(choreography).not.toBeNull()
    expect(choreography!.terminalStages[0]?.delayMs).toBe(0)
    expect(choreography!.terminalStages.at(-1)?.delayMs).toBe(0)
    expect(choreography!.terminalStages.every((stage) => stage.durationMs === 760)).toBe(true)
    expect(choreography!.totalDurationMs).toBe(760)

    const parallelGraph = createParallelGraph()
    const parallel = createTerminalWorkflowBuildChoreography({
      canvasNodes: [],
      change: createChange(parallelGraph),
      graph: parallelGraph,
      mode: 'simultaneous',
      reducedMotion: false
    })!
    const delayByBlockId = new Map(
      parallel.terminalStages.map((stage) => [stage.blockId, stage.delayMs])
    )

    expect(delayByBlockId.get('terminal-api')).toBe(delayByBlockId.get('terminal-worker'))
    expect(delayByBlockId.get('terminal-web')).toBe(0)
    expect(parallel.connectionStages[0]?.revealAtMs).toBe(260)
  })

  it('lets the final terminals settle before the group closes around them', () => {
    const graph = createParallelGraph()
    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [],
      change: { ...createChange(graph), terminalGroupIds: ['group-development'] },
      graph,
      mode: 'simultaneous',
      reducedMotion: false
    })!

    expect(choreography.groupStages).toEqual([
      { revealAtMs: 700, terminalGroupId: 'group-development' }
    ])
    expect(choreography.totalDurationMs).toBe(1_000)
  })

  it('starts at the Agent edge nearest the final workflow centroid', () => {
    expect(
      resolveTerminalWorkflowBuildOrigin({
        source: {
          position: { x: 100, y: 100 },
          size: { height: 400, width: 500 }
        },
        targetCenter: { x: 900, y: 260 }
      })
    ).toEqual({ x: 632, y: 279 })
  })

  it('uses the invoking Agent as the build origin instead of a closer unrelated node', () => {
    const createdGraph = createParallelGraph()
    const contextNode = {
      description: '',
      id: 'terminal-context',
      launchCommand: '',
      name: 'Context',
      position: { x: 200, y: 400 },
      size: { height: 280, width: 420 },
      type: 'terminal' as const
    }
    const graph = { ...createdGraph, blocks: [contextNode, ...createdGraph.blocks] }
    const change = {
      ...createChange(createdGraph),
      blockIds: createdGraph.blocks.map((block) => block.id)
    }
    const targetCenter = { x: 994, y: 550 }

    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [
        {
          nodeId: 'agent:agent-1',
          position: { x: -1_200, y: 0 },
          size: { height: 480, width: 520 }
        },
        { ...contextNode, nodeId: contextNode.id }
      ],
      change,
      graph,
      mode: 'progressive',
      originNodeId: 'agent:agent-1',
      reducedMotion: false
    })!

    expect(choreography.origin).toEqual(
      resolveTerminalWorkflowBuildOrigin({
        source: {
          position: { x: -1_200, y: 0 },
          size: { height: 480, width: 520 }
        },
        targetCenter
      })
    )
  })

  it('reveals terminals one at a time and grows downstream terminals from their parent', () => {
    const graph = createParallelGraph()
    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [],
      change: { ...createChange(graph), terminalGroupIds: ['group-development'] },
      graph,
      mode: 'progressive',
      reducedMotion: false
    })!

    expect(
      choreography.terminalStages.map(({ blockId, delayMs, durationMs }) => ({
        blockId,
        delayMs,
        durationMs
      }))
    ).toEqual([
      { blockId: 'terminal-api', delayMs: 0, durationMs: 520 },
      { blockId: 'terminal-worker', delayMs: 780, durationMs: 520 },
      { blockId: 'terminal-web', delayMs: 1_560, durationMs: 520 }
    ])
    expect(choreography.terminalStages[2]?.initialPosition).toEqual(
      graph.blocks.find((block) => block.id === 'terminal-api')?.position
    )
    expect(choreography.connectionStages).toEqual([
      { connectionId: 'connection-api-web', revealAtMs: 1_740 }
    ])
    expect(choreography.groupStages).toEqual([
      { revealAtMs: 2_320, terminalGroupId: 'group-development' }
    ])
    expect(choreography.totalDurationMs).toBe(2_620)
  })

  it('compresses progressive steps into a bounded launch window for large workflows', () => {
    const graph = createGraph(20)
    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [],
      change: createChange(graph),
      graph,
      mode: 'progressive',
      reducedMotion: false
    })!

    expect(choreography.terminalStages[0]?.delayMs).toBe(0)
    expect(choreography.terminalStages.at(-1)?.delayMs).toBe(8_000)
    expect(choreography.totalDurationMs).toBe(8_520)
  })

  it('collapses all movement and staging when reduced motion is requested', () => {
    const graph = createParallelGraph()
    const choreography = createTerminalWorkflowBuildChoreography({
      canvasNodes: [],
      change: createChange(graph),
      graph,
      mode: 'progressive',
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
    kind: 'terminal_build_created',
    operationId: 'workflow-operation-1',
    terminalGroupIds: []
  }
}
