import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import {
  projectWorkbenchObjectMotionOntoEdges,
  projectWorkbenchObjectMotion,
  resolveWorkbenchCanvasDetailLevel,
  scheduleWorkbenchCreatedObjectFocus
} from '../../../src/presentation/app-shell/workbenchObjectMotion'

describe('workbench object motion', () => {
  it.each([
    { expected: 'full', reduceVisualNoise: true, zoom: 1 },
    { expected: 'full', reduceVisualNoise: true, zoom: 0.78 },
    { expected: 'compact', reduceVisualNoise: true, zoom: 0.779 },
    { expected: 'compact', reduceVisualNoise: true, zoom: 0.52 },
    { expected: 'overview', reduceVisualNoise: true, zoom: 0.519 },
    { expected: 'full', reduceVisualNoise: true, zoom: Number.NaN },
    { expected: 'full', reduceVisualNoise: false, zoom: 0.779 },
    { expected: 'full', reduceVisualNoise: false, zoom: 0.519 }
  ] as const)(
    'resolves zoom $zoom with noise reduction $reduceVisualNoise to $expected',
    ({ expected, reduceVisualNoise, zoom }) => {
      expect(resolveWorkbenchCanvasDetailLevel(zoom, reduceVisualNoise)).toBe(expected)
    }
  )

  it('materializes newly projected objects without changing their final geometry', () => {
    const terminal = createTerminalNode('terminal-1', { x: 640, y: 360 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [],
      isContinuingGraph: true,
      nextNodes: [terminal],
      reducedMotion: false
    })

    expect(projection.exitingNodes).toEqual([])
    expect(projection.nodes).toEqual([
      expect.objectContaining({
        id: terminal.id,
        position: terminal.position,
        style: terminal.style,
        data: expect.objectContaining({
          objectMotion: {
            id: 'create:terminal-1',
            kind: 'create',
            offset: { x: 0, y: 0 },
            scale: { from: 0, to: 1 }
          }
        })
      })
    ])
  })

  it('keeps terminal-group creation on its existing non-scaling presentation', () => {
    const group = createGroupNode('group-1', false, [], {
      height: 360,
      width: 640,
      x: 640,
      y: 360
    })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [],
      isContinuingGraph: true,
      nextNodes: [group],
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toEqual({
      id: 'create:group-1',
      kind: 'create',
      offset: { x: 0, y: 0 }
    })
  })

  it.each([
    { name: 'terminal', node: createTerminalNode('terminal-1', { x: 640, y: 360 }) },
    { name: 'agent', node: createAgentNode('agent-1', { x: 640, y: 360 }) }
  ])('keeps a deleted $name as an inert presentation-only center exit', ({ node }) => {
    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [node],
      isContinuingGraph: true,
      nextNodes: [],
      reducedMotion: false
    })

    expect(projection.nodes).toEqual([])
    expect(projection.exitingNodes).toEqual([
      expect.objectContaining({
        id: node.id,
        draggable: false,
        selectable: false,
        selected: false,
        data: expect.objectContaining({
          objectMotion: {
            id: `delete:${node.id}`,
            kind: 'delete',
            offset: { x: 0, y: 0 },
            scale: { from: 1, to: 0 }
          }
        })
      })
    ])
  })

  it('preserves an in-flight delete motion across unrelated graph projections', () => {
    const terminal = createTerminalNode('terminal-1', { x: 640, y: 360 })
    const deletingTerminal = {
      ...terminal,
      data: {
        ...terminal.data,
        objectMotion: {
          id: 'delete:terminal-1:existing',
          kind: 'delete' as const,
          offset: { x: 0, y: 0 },
          scale: { from: 1, to: 0 }
        }
      }
    } as WorkbenchFlowNode

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [deletingTerminal],
      isContinuingGraph: true,
      nextNodes: [],
      reducedMotion: false
    })

    expect(projection.exitingNodes).toEqual([deletingTerminal])
  })

  it('does not retain deleted objects when reduced motion is requested', () => {
    const terminal = createTerminalNode('terminal-1', { x: 640, y: 360 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [terminal],
      isContinuingGraph: true,
      nextNodes: [],
      reducedMotion: true
    })

    expect(projection).toEqual({ exitingNodes: [], nodes: [] })
  })

  it('does not replay creation motion while restoring the initial graph projection', () => {
    const terminal = createTerminalNode('terminal-1', { x: 640, y: 360 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [],
      isContinuingGraph: false,
      nextNodes: [terminal],
      reducedMotion: false
    })

    expect(projection).toEqual({ exitingNodes: [], nodes: [terminal] })
  })

  it('expands group members from the collapsed group center', () => {
    const collapsedGroup = createGroupNode('group-1', true, ['terminal-1'], {
      height: 160,
      width: 360,
      x: 100,
      y: 100
    })
    const expandedGroup = createGroupNode('group-1', false, ['terminal-1'], {
      height: 600,
      width: 1_000,
      x: 100,
      y: 100
    })
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [collapsedGroup],
      isContinuingGraph: true,
      nextNodes: [expandedGroup, terminal],
      reducedMotion: false
    })

    expect(projection.exitingNodes).toEqual([])
    expect(projection.nodes[1]?.data.objectMotion).toEqual({
      contentDelayMs: 48,
      contentOpacity: { from: 0, to: 1 },
      delayMs: 0,
      id: 'group-expand:terminal-1',
      kind: 'group-expand',
      offset: { x: -320, y: -170 },
      opacity: { from: 0, to: 1 },
      scale: { from: 0.88, to: 1 }
    })
  })

  it('morphs one group material from the previous world rect to the committed rect', () => {
    const currentNodes = [
      createGroupNode('group-1', true, ['terminal-1'], {
        height: 180,
        width: 320,
        x: 100,
        y: 100
      })
    ]
    const nextNodes = [
      createGroupNode('group-1', false, ['terminal-1'], {
        height: 458,
        width: 984,
        x: 100,
        y: 100
      })
    ]

    const projection = projectWorkbenchObjectMotion({
      createMotionId: (kind, nodeId) => `${kind}:${nodeId}`,
      currentNodes,
      isContinuingGraph: true,
      nextNodes,
      reducedMotion: false
    })

    expect(projection.nodes[0]?.data.objectMotion).toEqual(
      expect.objectContaining({
        id: 'group-expand:group-1',
        kind: 'group-expand',
        contentOpacity: { from: 0, to: 1 },
        opacity: { from: 1, to: 1 },
        shellRect: {
          from: { height: 180, width: 320, x: 100, y: 100 },
          to: { height: 458, width: 984, x: 100, y: 100 }
        }
      })
    )
    expect(projection.nodes[0]?.data.objectMotion).not.toHaveProperty('scale')
  })

  it('retargets a collapsing member into expansion without snapping its live presentation', () => {
    const collapsedGroup = createGroupNode('group-1', true, ['terminal-1'], {
      height: 180,
      width: 320,
      x: 100,
      y: 100
    })
    const expandedGroup = createGroupNode('group-1', false, ['terminal-1'], {
      height: 458,
      width: 984,
      x: 100,
      y: 100
    })
    const collapsingMember = {
      ...createTerminalNode('terminal-1', { x: 420, y: 260 }),
      data: {
        ...createTerminalNode('terminal-1', { x: 420, y: 260 }).data,
        objectMotion: {
          id: 'group-collapse:terminal-1',
          kind: 'group-collapse' as const,
          offset: { x: -320, y: -170 }
        }
      }
    } as WorkbenchFlowNode

    const projection = projectWorkbenchObjectMotion({
      createMotionId: (kind, nodeId) => `${kind}:${nodeId}`,
      currentNodes: [collapsedGroup, collapsingMember],
      isContinuingGraph: true,
      nextNodes: [expandedGroup, createTerminalNode('terminal-1', { x: 420, y: 260 })],
      reducedMotion: false
    })

    expect(projection.nodes.find((node) => node.id === 'terminal-1')?.data.objectMotion).toEqual(
      expect.objectContaining({ id: 'group-expand:terminal-1', kind: 'group-expand' })
    )
  })

  it('keeps collapsing members as presentation-only exits along the reverse path', () => {
    const expandedGroup = createGroupNode('group-1', false, ['terminal-1'], {
      height: 600,
      width: 1_000,
      x: 100,
      y: 100
    })
    const collapsedGroup = createGroupNode('group-1', true, ['terminal-1'], {
      height: 160,
      width: 360,
      x: 100,
      y: 100
    })
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [expandedGroup, terminal],
      isContinuingGraph: true,
      nextNodes: [collapsedGroup],
      reducedMotion: false
    })

    expect(projection.nodes).toEqual([
      expect.objectContaining({
        id: collapsedGroup.id,
        data: expect.objectContaining({
          objectMotion: expect.objectContaining({
            id: 'group-collapse:group-1',
            kind: 'group-collapse',
            shellRect: {
              from: { height: 600, width: 1_000, x: 100, y: 100 },
              to: { height: 160, width: 360, x: 100, y: 100 }
            }
          })
        })
      })
    ])
    expect(projection.exitingNodes).toEqual([
      expect.objectContaining({
        id: 'terminal-1',
        draggable: false,
        selectable: false,
        position: terminal.position,
        data: expect.objectContaining({
          objectMotion: {
            delayMs: 0,
            id: 'group-collapse:terminal-1',
            kind: 'group-collapse',
            offset: { x: -320, y: -170 },
            scale: { from: 1, to: 0.88 }
          }
        })
      })
    ])
  })

  it('mirrors a bounded member cascade between expansion and collapse', () => {
    const memberIds = Array.from({ length: 8 }, (_, index) => `terminal-${index + 1}`)
    const collapsedGroup = createGroupNode('group-1', true, memberIds, {
      height: 180,
      width: 320,
      x: 100,
      y: 100
    })
    const expandedGroup = createGroupNode('group-1', false, memberIds, {
      height: 600,
      width: 1_000,
      x: 100,
      y: 100
    })
    const terminals = memberIds.map((id, index) =>
      createTerminalNode(id, { x: 420 + index * 24, y: 260 + index * 12 })
    )

    const expansion = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [collapsedGroup],
      isContinuingGraph: true,
      nextNodes: [expandedGroup, ...terminals],
      reducedMotion: false
    })
    const collapse = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [expandedGroup, ...terminals],
      isContinuingGraph: true,
      nextNodes: [collapsedGroup],
      reducedMotion: false
    })
    const expandDelays = expansion.nodes
      .filter((node) => node.type === 'terminal')
      .map((node) => node.data.objectMotion?.delayMs)
    const collapseDelays = collapse.exitingNodes.map((node) => node.data.objectMotion?.delayMs)

    expect(expandDelays[0]).toBe(0)
    expect(expandDelays.at(-1)).toBe(60)
    expect(collapseDelays).toEqual([...expandDelays].reverse())
    expect(expandDelays.every((delay) => delay !== undefined && delay <= 60)).toBe(true)
  })

  it('absorbs a newly joined terminal while existing group members make room', () => {
    const currentGroup = createGroupNode('group-1', false, ['terminal-2'], {
      height: 420,
      width: 760,
      x: 100,
      y: 100
    })
    const nextGroup = createGroupNode('group-1', false, ['terminal-2', 'terminal-1'], {
      height: 460,
      width: 820,
      x: 100,
      y: 100
    })
    const draggedTerminal = createTerminalNode('terminal-1', { x: 460, y: 280 })
    const settledTerminal = createTerminalNode('terminal-1', { x: 500, y: 300 })
    const currentMember = createTerminalNode('terminal-2', { x: 700, y: 300 })
    const reflowedMember = createTerminalNode('terminal-2', { x: 300, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [currentGroup, draggedTerminal, currentMember],
      isContinuingGraph: true,
      nextNodes: [nextGroup, settledTerminal, reflowedMember],
      reducedMotion: false
    })

    expect(projection.exitingNodes).toEqual([])
    expect(projection.nodes[0]?.data.objectMotion).toBeUndefined()
    expect(projection.nodes[1]?.data.objectMotion).toEqual({
      id: 'group-join:terminal-1',
      kind: 'group-join',
      offset: { x: -40, y: -20 }
    })
    expect(projection.nodes[2]?.data.objectMotion).toEqual({
      id: 'group-reflow:terminal-2',
      kind: 'group-reflow',
      offset: { x: 400, y: 0 }
    })
  })

  it('settles creation and group changes immediately for reduced motion', () => {
    const expandedGroup = createGroupNode('group-1', false, ['terminal-1'], {
      height: 600,
      width: 1_000,
      x: 100,
      y: 100
    })
    const collapsedGroup = createGroupNode('group-1', true, ['terminal-1'], {
      height: 160,
      width: 360,
      x: 100,
      y: 100
    })
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [expandedGroup, terminal],
      isContinuingGraph: true,
      nextNodes: [collapsedGroup],
      reducedMotion: true
    })

    expect(projection).toEqual({ exitingNodes: [], nodes: [collapsedGroup] })
  })

  it('settles group membership changes immediately for reduced motion', () => {
    const currentGroup = createGroupNode('group-1', false, [], {
      height: 420,
      width: 760,
      x: 100,
      y: 100
    })
    const nextGroup = createGroupNode('group-1', false, ['terminal-1'], {
      height: 460,
      width: 820,
      x: 100,
      y: 100
    })
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [currentGroup, terminal],
      isContinuingGraph: true,
      nextNodes: [nextGroup, terminal],
      reducedMotion: true
    })

    expect(projection).toEqual({ exitingNodes: [], nodes: [nextGroup, terminal] })
  })

  it('starts created-object focus after one presented object frame and remains cancellable', () => {
    const frames = new TestFrameScheduler()
    const focus = vi.fn()
    const cancel = scheduleWorkbenchCreatedObjectFocus(focus, frames)

    expect(frames.pendingCount).toBe(1)
    frames.step()
    expect(focus).not.toHaveBeenCalled()
    expect(frames.pendingCount).toBe(1)
    frames.step()
    expect(focus).toHaveBeenCalledOnce()

    const staleFocus = vi.fn()
    const cancelStale = scheduleWorkbenchCreatedObjectFocus(staleFocus, frames)
    frames.step()
    cancelStale()
    frames.step()
    expect(staleFocus).not.toHaveBeenCalled()

    cancel()
  })

  it('holds workflow edges until expanding group members reach stable handle geometry', () => {
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })
    const expandingTerminal = {
      ...terminal,
      data: {
        ...terminal.data,
        objectMotion: {
          id: 'group-expand:terminal-1',
          kind: 'group-expand' as const,
          offset: { x: -320, y: -170 }
        }
      }
    } as WorkbenchFlowNode
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

  it.each(['group-join', 'group-leave', 'group-reflow'] as const)(
    'holds workflow edges until a terminal finishes %s motion',
    (kind) => {
      const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })
      const joinedTerminal = {
        ...terminal,
        data: {
          ...terminal.data,
          objectMotion: {
            id: `${kind}:terminal-1`,
            kind,
            offset: { x: -40, y: -20 }
          }
        }
      } as WorkbenchFlowNode
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

function createMotionId(kind: string, nodeId: string): string {
  return `${kind}:${nodeId}`
}

function createTerminalNode(
  id: string,
  position: { readonly x: number; readonly y: number }
): WorkbenchFlowNode {
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

function createAgentNode(
  agentId: string,
  position: { readonly x: number; readonly y: number }
): WorkbenchFlowNode {
  const id = `agent:${agentId}`
  return {
    data: {
      agent: {
        agentId,
        layout: {
          position,
          size: { height: 360, width: 420 }
        }
      }
    },
    id,
    position,
    style: { height: 360, width: 420 },
    type: 'agentConsole'
  } as unknown as WorkbenchFlowNode
}

function createGroupNode(
  id: string,
  isCollapsed: boolean,
  memberBlockIds: readonly string[],
  rect: { readonly height: number; readonly width: number; readonly x: number; readonly y: number }
): WorkbenchFlowNode {
  return {
    data: {
      group: {
        id,
        isCollapsed,
        memberBlockIds,
        position: { x: rect.x, y: rect.y },
        size: { height: rect.height, width: rect.width }
      }
    },
    id,
    position: { x: rect.x, y: rect.y },
    style: { height: rect.height, width: rect.width },
    type: 'terminalGroup'
  } as unknown as WorkbenchFlowNode
}

class TestFrameScheduler {
  private callbacks = new Map<number, FrameRequestCallback>()
  private nextFrameId = 1

  readonly cancelFrame = (frameId: number): void => {
    this.callbacks.delete(frameId)
  }

  readonly requestFrame = (callback: FrameRequestCallback): number => {
    const frameId = this.nextFrameId
    this.nextFrameId += 1
    this.callbacks.set(frameId, callback)
    return frameId
  }

  get pendingCount(): number {
    return this.callbacks.size
  }

  step(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(0))
  }
}
