import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { resolveWorkbenchSafeViewport } from '../../../src/presentation/app-shell/workbenchCanvasSafeViewport'
import { createWorkbenchNodeCreationCoordinator } from '../../../src/presentation/app-shell/workbenchNodeCreationCoordinator'
import { createWorkbenchNodeOccupancy } from '../../../src/presentation/app-shell/workbenchNodeOccupancy'
import { workbenchNodePlacementGap } from '../../../src/presentation/app-shell/workbenchNodeCreationPolicy'

describe('workbench node creation coordination', () => {
  const geometry = {
    canvasSize: { width: 1_200, height: 800 },
    currentViewport: { x: 0, y: 0, zoom: 1 },
    nodeSize: { width: 720, height: 460 },
    occupiedRects: [],
    projectedNodeIds: [],
    safeViewport: { x: 24, y: 184, width: 1_152, height: 592 }
  }

  it('reserves distinct positions for overlapping creation requests in one workspace', () => {
    const coordinator = createWorkbenchNodeCreationCoordinator()
    const first = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })
    const second = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })

    expect(hasGap(first, second, geometry.nodeSize)).toBe(true)

    coordinator.commit(first.reservationId, 'terminal-1')
    const third = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })

    expect(hasGap(first, third, geometry.nodeSize)).toBe(true)
    expect(hasGap(second, third, geometry.nodeSize)).toBe(true)
  })

  it('releases failed reservations and clears stale reservations on workspace changes', () => {
    const coordinator = createWorkbenchNodeCreationCoordinator()
    const first = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })

    coordinator.release(first.reservationId)

    expect(coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' }).position).toEqual(
      first.position
    )
    expect(coordinator.reserve({ ...geometry, scopeKey: 'project-2\0main' }).position).toEqual(
      first.position
    )
  })

  it('drops a committed reservation after its projected node becomes authoritative', () => {
    const coordinator = createWorkbenchNodeCreationCoordinator()
    const first = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })
    coordinator.commit(first.reservationId, 'terminal-1')

    const projectedNode = {
      id: 'terminal-1',
      position: first.position,
      size: geometry.nodeSize
    }
    const second = coordinator.reserve({
      ...geometry,
      occupiedRects: [projectedNode],
      projectedNodeIds: [projectedNode.id],
      scopeKey: 'project-1\0main'
    })

    expect(coordinator.inspectReservations()).toHaveLength(1)
    expect(hasGap(first, second, geometry.nodeSize)).toBe(true)
  })

  it('reconciles a projected grouped member without counting it as another obstacle', () => {
    const coordinator = createWorkbenchNodeCreationCoordinator()
    const first = coordinator.reserve({ ...geometry, scopeKey: 'project-1\0main' })
    coordinator.commit(first.reservationId, 'member-1')

    coordinator.reserve({
      ...geometry,
      occupiedRects: [
        {
          id: 'group-1',
          position: { x: 100, y: 100 },
          size: { width: 900, height: 540 }
        }
      ],
      projectedNodeIds: ['group-1', 'member-1', 'member-2'],
      scopeKey: 'project-1\0main'
    })

    expect(coordinator.inspectReservations()).toHaveLength(1)
  })
})

describe('workbench node occupancy', () => {
  it('treats a terminal group as one visual unit and includes ungrouped terminals and Agents', () => {
    const nodes = [
      createNode('group-1', 'terminalGroup', { x: 100, y: 120 }, { width: 900, height: 540 }, [
        'member-1',
        'member-2'
      ]),
      createNode('member-1', 'terminal', { x: 180, y: 220 }, { width: 360, height: 240 }),
      createNode('member-2', 'terminal', { x: 560, y: 220 }, { width: 360, height: 240 }),
      createNode('terminal-3', 'terminal', { x: 1_080, y: 220 }, { width: 720, height: 460 }),
      createNode('agent:agent-1', 'agentConsole', { x: -680, y: 220 }, { width: 720, height: 460 })
    ]

    expect(createWorkbenchNodeOccupancy(nodes).map((rect) => rect.id)).toEqual([
      'agent:agent-1',
      'group-1',
      'terminal-3'
    ])
  })
})

describe('workbench safe viewport', () => {
  it('uses the lowest canvas obstruction and a uniform screen margin', () => {
    expect(
      resolveWorkbenchSafeViewport({
        canvasRect: { left: 100, top: 50, right: 1_300, bottom: 850 },
        obstructionRects: [
          { left: 980, top: 96, right: 1_276, bottom: 156 },
          { left: 112, top: 62, right: 320, bottom: 240 }
        ]
      })
    ).toEqual({
      x: 24,
      y: 214,
      width: 1_152,
      height: 562
    })
  })
})

function createNode(
  id: string,
  type: WorkbenchFlowNode['type'],
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number },
  memberBlockIds: readonly string[] = []
): WorkbenchFlowNode {
  const data =
    type === 'terminalGroup'
      ? { group: { memberBlockIds, size } }
      : type === 'terminal'
        ? { block: { size } }
        : { agent: { layout: { size } } }

  return {
    id,
    data,
    position,
    style: size,
    type
  } as WorkbenchFlowNode
}

function hasGap(
  left: { readonly position: { readonly x: number; readonly y: number } },
  right: { readonly position: { readonly x: number; readonly y: number } },
  size: { readonly width: number; readonly height: number }
): boolean {
  return (
    left.position.x + size.width + workbenchNodePlacementGap <= right.position.x ||
    right.position.x + size.width + workbenchNodePlacementGap <= left.position.x ||
    left.position.y + size.height + workbenchNodePlacementGap <= right.position.y ||
    right.position.y + size.height + workbenchNodePlacementGap <= left.position.y
  )
}
