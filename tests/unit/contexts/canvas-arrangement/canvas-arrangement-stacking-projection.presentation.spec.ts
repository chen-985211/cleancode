import type { CanvasArrangementSnapshot } from '../../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import {
  createCanvasArrangementStackingZIndexProjection,
  resolveCanvasStackDragTarget,
  type CanvasArrangementProjectionNode
} from '../../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementStackingProjection'

describe('canvas arrangement stacking projection', () => {
  const arrangement: CanvasArrangementSnapshot = {
    projectId: 'project-1',
    workspaceId: 'main',
    stacks: [
      {
        anchor: { x: 100, y: 100 },
        id: 'stack-1',
        items: [
          { kind: 'workflow', terminalIds: ['terminal-1', 'terminal-2'] },
          { kind: 'combination', terminalGroupId: 'group-1' },
          { kind: 'agent', agentId: 'agent-1' }
        ]
      }
    ]
  }
  const nodes: CanvasArrangementProjectionNode[] = [
    { id: 'terminal-1', reference: { kind: 'terminal', terminalId: 'terminal-1' } },
    { id: 'terminal-2', reference: { kind: 'terminal', terminalId: 'terminal-2' } },
    {
      id: 'group-1',
      memberNodeIds: ['group-terminal-1'],
      reference: { kind: 'combination', terminalGroupId: 'group-1' }
    },
    {
      id: 'group-terminal-1',
      reference: { kind: 'terminal', terminalId: 'group-terminal-1' }
    },
    { id: 'agent-node-1', reference: { kind: 'agent', agentId: 'agent-1' } }
  ]

  it('projects stable object bands without depending on Workbench node types', () => {
    const zIndex = createCanvasArrangementStackingZIndexProjection(arrangement, nodes)

    expect(zIndex.get('terminal-1')!).toBeLessThan(zIndex.get('group-1')!)
    expect(zIndex.get('group-1')!).toBeLessThan(zIndex.get('group-terminal-1')!)
    expect(zIndex.get('group-terminal-1')!).toBeLessThan(zIndex.get('agent-node-1')!)
  })

  it('includes the complete combination when a member starts the stack drag', () => {
    const target = resolveCanvasStackDragTarget({
      arrangement,
      items: selectionItems(),
      nodeId: 'group-terminal-1',
      nodes
    })

    expect(target?.stackId).toBe('stack-1')
    expect(new Set(target?.nodeIds)).toEqual(
      new Set(['terminal-1', 'terminal-2', 'group-1', 'group-terminal-1', 'agent-node-1'])
    )
  })
})

function selectionItems(): CanvasArrangementSelectionItem[] {
  return [
    item('workflow:terminal-1,terminal-2', ['terminal-1', 'terminal-2'], {
      kind: 'workflow',
      terminalIds: ['terminal-1', 'terminal-2']
    }),
    item('combination:group-1', ['group-1'], {
      kind: 'combination',
      terminalGroupId: 'group-1'
    }),
    item('agent:agent-1', ['agent-node-1'], { kind: 'agent', agentId: 'agent-1' })
  ]
}

function item(
  key: string,
  nodeIds: readonly string[],
  reference: CanvasArrangementSelectionItem['reference']
): CanvasArrangementSelectionItem {
  return {
    key,
    nodeIds,
    position: { x: 0, y: 0 },
    reference,
    size: { height: 100, width: 100 }
  }
}
