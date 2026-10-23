import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { projectWorkbenchObjectMotion } from '../../../src/presentation/app-shell/projections/workbenchObjectMotion'
import { createWorkbenchObjectSpringController } from '../../../src/presentation/app-shell/workbench/nodes/workbenchObjectSpring'

describe('group member disclosure geometry', () => {
  it.each([
    { collapsed: true, axis: 'x' },
    { collapsed: false, axis: 'x' },
    { collapsed: true, axis: 'y' },
    { collapsed: false, axis: 'y' }
  ] as const)(
    'keeps adjacent members from overlapping during disclosure: $axis, collapsed=$collapsed',
    ({ collapsed, axis }) => {
      const terminals = [
        createTerminalNode('first', { x: 100, y: 100 }),
        createTerminalNode('second', axis === 'x' ? { x: 320, y: 100 } : { x: 100, y: 220 })
      ]
      const expanded = createGroupNode('group', false, ['first', 'second'], {
        x: 70,
        y: 40,
        width: 500,
        height: 400
      })
      const folded = createGroupNode('group', true, ['first', 'second'], {
        x: 70,
        y: 40,
        width: 112,
        height: 112
      })
      const projection = projectWorkbenchObjectMotion({
        createMotionId,
        currentNodes: collapsed ? [expanded, ...terminals] : [folded],
        nextNodes: collapsed ? [folded] : [expanded, ...terminals],
        isContinuingGraph: true,
        reducedMotion: false
      })
      const members = (collapsed ? projection.exitingNodes : projection.nodes).filter(
        (node) => node.type === 'terminal'
      )
      const scheduler = new TestFrameScheduler()
      const surfaces = members.map((node) => {
        const surface = document.createElement('div')
        createWorkbenchObjectSpringController({ scheduler }).motionChanged(
          surface,
          node.data.objectMotion!,
          false,
          () => undefined
        )
        return surface
      })
      for (let frame = 0; frame < 90; frame += 1) {
        scheduler.step()
        const bounds = members.map((node, index) => {
          const style = surfaces[index]!.style
          const scale = Number(style.getPropertyValue('--workbench-object-motion-scale'))
          const offset = parseFloat(style.getPropertyValue(`--workbench-object-motion-${axis}`))
          const size = Number(axis === 'x' ? node.style!.width : node.style!.height)
          const center = node.position[axis] + size / 2 + offset
          return { start: center - (size * scale) / 2, end: center + (size * scale) / 2 }
        })
        expect(bounds[0]!.end, `overlap at frame ${frame}`).toBeLessThanOrEqual(
          bounds[1]!.start + 0.02
        )
      }
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
  private timestamp = 0

  readonly now = (): number => this.timestamp

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
    this.timestamp += 1000 / 60
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(this.timestamp))
  }
}
