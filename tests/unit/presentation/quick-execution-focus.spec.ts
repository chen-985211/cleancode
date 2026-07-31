import type { Edge, ReactFlowInstance } from '@xyflow/react'

import { focusQuickExecutionTargetInCanvas } from '../../../src/presentation/app-shell/quickExecutionFocus'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('quick execution canvas focus', () => {
  it.each([
    {
      expectedNodeIds: ['terminal-1'],
      target: { type: 'terminal' as const, terminalBlockId: 'terminal-1' }
    },
    {
      expectedNodeIds: ['terminal-1', 'terminal-2'],
      target: {
        type: 'workflow' as const,
        terminalBlockIds: ['terminal-1', 'terminal-2']
      }
    },
    {
      expectedNodeIds: ['combination-1'],
      target: { type: 'combination' as const, terminalGroupId: 'combination-1' }
    }
  ])('fits the complete $target.type target into the canvas', ({ expectedNodeIds, target }) => {
    const nodes = [
      createNode('terminal-1', 'terminal'),
      createNode('terminal-2', 'terminal'),
      createNode('combination-1', 'terminalGroup')
    ]
    const fitView = vi.fn(async () => true)
    const instance = {
      fitView,
      getNode: (nodeId: string) => nodes.find((node) => node.id === nodeId)
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

    expect(focusQuickExecutionTargetInCanvas({ instance, target })).toBe(true)
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      maxZoom: 1,
      nodes: expectedNodeIds.map((nodeId) => expect.objectContaining({ id: nodeId })),
      padding: 0.24
    })
  })

  it('does not move the canvas when any target node is unavailable', () => {
    const fitView = vi.fn(async () => true)
    const instance = {
      fitView,
      getNode: () => undefined
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

    expect(
      focusQuickExecutionTargetInCanvas({
        instance,
        target: { type: 'terminal', terminalBlockId: 'removed-terminal' }
      })
    ).toBe(false)
    expect(fitView).not.toHaveBeenCalled()
  })
})

function createNode(id: string, type: 'terminal' | 'terminalGroup'): WorkbenchFlowNode {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    type
  } as WorkbenchFlowNode
}
