import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  createWorkbenchObjectMotionEdgeProjector,
  projectWorkbenchObjectMotionOntoEdges
} from '../../../src/presentation/app-shell/projections/workbenchObjectMotion'

describe('workbench object motion edges', () => {
  it('holds workflow edges until expanding group members reach stable handle geometry', () => {
    const terminal = createTerminalNode('terminal-1')
    const expandingTerminal = withObjectMotion(terminal, 'group-expand')
    const edges = [
      { id: 'connected', source: 'terminal-1', target: 'terminal-2' },
      { id: 'unrelated', source: 'terminal-3', target: 'terminal-4' }
    ]

    expect(projectWorkbenchObjectMotionOntoEdges(edges, [expandingTerminal])).toEqual([
      expect.objectContaining({
        id: 'connected',
        className: 'workbench-object-edge--motion-pending'
      }),
      edges[1]
    ])
    expect(projectWorkbenchObjectMotionOntoEdges(edges, [terminal])).toBe(edges)
  })

  it('keeps projected edge references stable when unrelated node data changes', () => {
    const projector = createWorkbenchObjectMotionEdgeProjector()
    const terminal = createTerminalNode('terminal-1')
    const expandingTerminal = withObjectMotion(terminal, 'group-expand')
    const unrelatedTerminal = createTerminalNode('terminal-3')
    const edges = [
      { id: 'connected', source: 'terminal-1', target: 'terminal-2' },
      { id: 'unrelated', source: 'terminal-3', target: 'terminal-4' }
    ]

    const firstProjection = projector.project(edges, [expandingTerminal, unrelatedTerminal])
    const secondProjection = projector.project(edges, [
      expandingTerminal,
      { ...unrelatedTerminal, selected: true }
    ])

    expect(secondProjection[0]).toBe(firstProjection[0])
    expect(secondProjection[1]).toBe(edges[1])
    expect(projector.project(edges, [terminal, unrelatedTerminal])).toBe(edges)
  })

  it.each(['group-join', 'group-leave', 'group-reflow'] as const)(
    'holds workflow edges until a terminal finishes %s motion',
    (kind) => {
      const joinedTerminal = withObjectMotion(createTerminalNode('terminal-1'), kind)
      const edges = [{ id: 'connected', source: 'terminal-1', target: 'terminal-2' }]

      expect(projectWorkbenchObjectMotionOntoEdges(edges, [joinedTerminal])).toEqual([
        expect.objectContaining({
          id: 'connected',
          className: 'workbench-object-edge--motion-pending'
        })
      ])
    }
  )
})

function createTerminalNode(id: string): WorkbenchFlowNode {
  const position = { x: 500, y: 300 }
  return {
    data: {
      block: {
        id,
        position,
        size: { height: 100, width: 200 }
      }
    },
    id,
    position,
    style: { height: 100, width: 200 },
    type: 'terminal'
  } as unknown as WorkbenchFlowNode
}

function withObjectMotion(
  terminal: WorkbenchFlowNode,
  kind: 'group-expand' | 'group-join' | 'group-leave' | 'group-reflow'
): WorkbenchFlowNode {
  return {
    ...terminal,
    data: {
      ...terminal.data,
      objectMotion: {
        id: `${kind}:${terminal.id}`,
        kind,
        offset: { x: -40, y: -20 }
      }
    }
  } as WorkbenchFlowNode
}
