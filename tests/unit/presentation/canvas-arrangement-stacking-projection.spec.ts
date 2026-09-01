import type { CanvasArrangementSnapshot } from '../../../src/contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import { resolveCanvasStackDragTarget } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementStackingProjection'
import {
  projectCanvasArrangementStackingOntoNodes,
  toCanvasArrangementProjectionNodes
} from '../../../src/presentation/app-shell/projections/workbenchCanvasArrangementStackingProjection'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('canvas arrangement stacking projection', () => {
  it('projects one z-index band per stacked object while keeping combination members above its shell', () => {
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 100, y: 100 },
          items: [
            { kind: 'terminal', terminalId: 'terminal-1' },
            { kind: 'combination', terminalGroupId: 'group-1' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    }
    const nodes = [
      node('terminal-1', 'terminal'),
      node('group-1', 'terminalGroup', ['group-terminal-1']),
      node('group-terminal-1', 'terminal'),
      node('agent:agent-1', 'agentConsole')
    ]

    const projected = projectCanvasArrangementStackingOntoNodes(arrangement, nodes)
    const zIndex = Object.fromEntries(
      projected.map((candidate) => [candidate.id, candidate.zIndex])
    )

    expect(zIndex['terminal-1']!).toBeLessThan(zIndex['group-1']!)
    expect(zIndex['group-1']!).toBeLessThan(zIndex['group-terminal-1']!)
    expect(zIndex['group-terminal-1']!).toBeLessThan(zIndex['agent:agent-1']!)
  })

  it('resolves every visual node in a mixed stack when dragging any member', () => {
    const arrangement: CanvasArrangementSnapshot = {
      projectId: 'project-1',
      workspaceId: 'main',
      stacks: [
        {
          id: 'stack-1',
          anchor: { x: 100, y: 100 },
          items: [
            { kind: 'workflow', terminalIds: ['terminal-1', 'terminal-2'] },
            { kind: 'combination', terminalGroupId: 'group-1' },
            { kind: 'agent', agentId: 'agent-1' }
          ]
        }
      ]
    }
    const nodes = [
      node('terminal-1', 'terminal'),
      node('terminal-2', 'terminal'),
      node('group-1', 'terminalGroup', ['group-terminal-1']),
      node('group-terminal-1', 'terminal'),
      node('agent:agent-1', 'agentConsole')
    ]
    const items: CanvasArrangementSelectionItem[] = [
      item('workflow:terminal-1,terminal-2', ['terminal-1', 'terminal-2'], {
        kind: 'workflow',
        terminalIds: ['terminal-1', 'terminal-2']
      }),
      item('combination:group-1', ['group-1'], {
        kind: 'combination',
        terminalGroupId: 'group-1'
      }),
      item('agent:agent-1', ['agent:agent-1'], { kind: 'agent', agentId: 'agent-1' })
    ]

    const target = resolveCanvasStackDragTarget({
      arrangement,
      items,
      nodeId: 'group-terminal-1',
      nodes: toCanvasArrangementProjectionNodes(nodes)
    })

    expect(target?.stackId).toBe('stack-1')
    expect(target?.items.map((candidate) => candidate.key)).toEqual([
      'workflow:terminal-1,terminal-2',
      'combination:group-1',
      'agent:agent-1'
    ])
    expect(new Set(target?.nodeIds)).toEqual(
      new Set(['terminal-1', 'terminal-2', 'group-1', 'group-terminal-1', 'agent:agent-1'])
    )
  })
})

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
    size: { width: 100, height: 100 }
  }
}

function node(
  id: string,
  type: WorkbenchFlowNode['type'],
  memberBlockIds: readonly string[] = []
): WorkbenchFlowNode {
  return {
    id,
    type,
    data: type === 'terminalGroup' ? { group: { memberBlockIds } } : {},
    position: { x: 0, y: 0 }
  } as unknown as WorkbenchFlowNode
}
