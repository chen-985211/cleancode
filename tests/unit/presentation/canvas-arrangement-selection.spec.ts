import { BlockGraph } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { canvasArrangementItemKey } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import {
  projectCanvasArrangementSelectionOntoNodes,
  resolveCanvasArrangementSelectionItems
} from '../../../src/presentation/app-shell/projections/workbenchCanvasArrangementSelection'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('canvas arrangement selection', () => {
  it('selects independent terminals, complete workflows, combinations, and agents as whole objects', () => {
    const graph = createGraph()
    const selection = resolveCanvasArrangementSelectionItems({
      arrangement: emptyArrangement(),
      graph: graph.toSnapshot(),
      nodes: [
        terminalNode('terminal-a', 0, 0, 100, 80),
        terminalNode('workflow-a', 200, 0, 100, 80),
        terminalNode('workflow-b', 360, 0, 100, 80),
        groupNode('group-1', 0, 200, 420, 220, ['group-terminal-a', 'group-terminal-b']),
        terminalNode('group-terminal-a', 30, 240, 100, 80),
        terminalNode('group-terminal-b', 180, 240, 100, 80),
        agentNode('agent-1', 520, 0, 180, 140)
      ],
      selection: { x: -20, y: -20, width: 760, height: 480 }
    })

    expect(selection.map((item) => item.reference)).toEqual([
      { kind: 'terminal', terminalId: 'terminal-a' },
      { kind: 'workflow', terminalIds: ['workflow-a', 'workflow-b'] },
      { kind: 'agent', agentId: 'agent-1' },
      { kind: 'combination', terminalGroupId: 'group-1' }
    ])
    expect(selection.flatMap((item) => item.nodeIds)).not.toContain('group-terminal-a')
  })

  it('selects a complete canvas object when any part of its visual bounds intersects the marquee', () => {
    const graph = createGraph()

    const selection = resolveCanvasArrangementSelectionItems({
      arrangement: emptyArrangement(),
      graph: graph.toSnapshot(),
      nodes: [
        terminalNode('terminal-a', 0, 0, 100, 80),
        terminalNode('workflow-a', 200, 0, 100, 80),
        terminalNode('workflow-b', 360, 0, 100, 80)
      ],
      selection: { x: 295, y: 70, width: 10, height: 20 }
    })

    expect(selection.map((item) => item.reference)).toEqual([
      { kind: 'workflow', terminalIds: ['workflow-a', 'workflow-b'] }
    ])
  })

  it('does not select an object whose visual bounds do not intersect the marquee', () => {
    const graph = createGraph()

    const selection = resolveCanvasArrangementSelectionItems({
      arrangement: emptyArrangement(),
      graph: graph.toSnapshot(),
      nodes: [terminalNode('terminal-a', 0, 0, 100, 80)],
      selection: { x: 101, y: 0, width: 20, height: 80 }
    })

    expect(selection).toEqual([])
  })

  it('expands a hit on one stacked object to every valid object in that stack', () => {
    const graph = createGraph()
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 100, y: 100 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-a' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    }

    const selection = resolveCanvasArrangementSelectionItems({
      arrangement,
      graph: graph.toSnapshot(),
      nodes: [
        terminalNode('terminal-a', 100, 100, 100, 80),
        agentNode('agent-1', 110, 110, 180, 140)
      ],
      selection: { x: 95, y: 95, width: 110, height: 90 }
    })

    expect(selection.map((item) => canvasArrangementItemKey(item.reference))).toEqual([
      'terminal:terminal-a',
      'agent:agent-1'
    ])
  })

  it('uses only the top object as the visible selection proxy for a tight stack', () => {
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 100, y: 100 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-a' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    }
    const items = [
      selectionItem('terminal-a', { kind: 'terminal', terminalId: 'terminal-a' }),
      selectionItem('agent:agent-1', { kind: 'agent', agentId: 'agent-1' })
    ]

    const projected = projectCanvasArrangementSelectionOntoNodes(
      [terminalNode('terminal-a', 100, 100, 100, 80), agentNode('agent-1', 110, 110, 180, 140)],
      items,
      arrangement
    )

    expect(projected.find((node) => node.id === 'terminal-a')?.className).toBeUndefined()
    expect(projected.find((node) => node.id === 'agent:agent-1')?.className).toContain(
      'canvas-arrangement-node--selected'
    )
  })

  it('keeps every selected object outlined when there is no stack relation', () => {
    const nodes = [
      terminalNode('terminal-a', 100, 100, 100, 80),
      agentNode('agent-1', 110, 110, 180, 140)
    ]
    const items = [
      selectionItem('terminal-a', { kind: 'terminal', terminalId: 'terminal-a' }),
      selectionItem('agent:agent-1', { kind: 'agent', agentId: 'agent-1' })
    ]
    const projected = projectCanvasArrangementSelectionOntoNodes(nodes, items)

    expect(
      projected.every((node) => node.className?.includes('canvas-arrangement-node--selected'))
    ).toBe(true)
  })
})

function selectionItem(
  nodeId: string,
  reference: CanvasArrangementSnapshot['stacks'][number]['items'][number]
) {
  return {
    key: canvasArrangementItemKey(reference),
    nodeIds: [nodeId],
    position: { x: 0, y: 0 },
    reference,
    size: { width: 100, height: 80 }
  }
}

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  for (const id of [
    'terminal-a',
    'workflow-a',
    'workflow-b',
    'group-terminal-a',
    'group-terminal-b'
  ]) {
    graph.createTerminalBlock({ id, name: id, description: '', position: { x: 0, y: 0 } })
  }
  graph.connectTerminalBlocks({
    id: 'workflow-edge',
    sourceBlockId: 'workflow-a',
    targetBlockId: 'workflow-b'
  })
  graph.createTerminalGroup({
    id: 'group-1',
    name: 'Group',
    memberBlockIds: ['group-terminal-a', 'group-terminal-b']
  })
  return graph
}

function emptyArrangement(): CanvasArrangementSnapshot {
  return { projectId: 'project-1', workspaceId: 'main', stacks: [] }
}

function terminalNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): WorkbenchFlowNode {
  return {
    id,
    type: 'terminal',
    position: { x, y },
    style: { width, height },
    data: { block: { id, size: { width, height } } }
  } as unknown as WorkbenchFlowNode
}

function groupNode(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  memberBlockIds: readonly string[]
): WorkbenchFlowNode {
  return {
    id,
    type: 'terminalGroup',
    position: { x, y },
    style: { width, height },
    data: { group: { id, size: { width, height }, memberBlockIds } }
  } as unknown as WorkbenchFlowNode
}

function agentNode(
  agentId: string,
  x: number,
  y: number,
  width: number,
  height: number
): WorkbenchFlowNode {
  return {
    id: `agent:${agentId}`,
    type: 'agentConsole',
    position: { x, y },
    style: { width, height },
    data: { agent: { agentId, layout: { size: { width, height } } } }
  } as unknown as WorkbenchFlowNode
}
