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
            offset: { x: 0, y: 0 }
          }
        })
      })
    ])
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
      id: 'group-expand:terminal-1',
      kind: 'group-expand',
      offset: { x: -320, y: -170 }
    })
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

    expect(projection.nodes).toEqual([collapsedGroup])
    expect(projection.exitingNodes).toEqual([
      expect.objectContaining({
        id: 'terminal-1',
        position: terminal.position,
        data: expect.objectContaining({
          objectMotion: {
            id: 'group-collapse:terminal-1',
            kind: 'group-collapse',
            offset: { x: -320, y: -170 }
          }
        })
      })
    ])
  })

  it('hands a newly joined terminal into a stationary group', () => {
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
    const draggedTerminal = createTerminalNode('terminal-1', { x: 460, y: 280 })
    const settledTerminal = createTerminalNode('terminal-1', { x: 500, y: 300 })

    const projection = projectWorkbenchObjectMotion({
      createMotionId,
      currentNodes: [currentGroup, draggedTerminal],
      isContinuingGraph: true,
      nextNodes: [nextGroup, settledTerminal],
      reducedMotion: false
    })

    expect(projection.exitingNodes).toEqual([])
    expect(projection.nodes[0]?.data.objectMotion).toBeUndefined()
    expect(projection.nodes[1]?.data.objectMotion).toEqual({
      id: 'group-join:terminal-1',
      kind: 'group-join',
      offset: { x: -40, y: -20 }
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

  it('holds workflow edges until a joined terminal finishes settling', () => {
    const terminal = createTerminalNode('terminal-1', { x: 500, y: 300 })
    const joinedTerminal = {
      ...terminal,
      data: {
        ...terminal.data,
        objectMotion: {
          id: 'group-join:terminal-1',
          kind: 'group-join' as const,
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
  })
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
