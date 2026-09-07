import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSelectionItem } from '../../../src/contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import { createCanvasArrangementGridPlan } from '../../../src/presentation/app-shell/projections/workbenchCanvasArrangementGridPlanning'

describe('canvas arrangement grid planning', () => {
  it.each([
    ['mixed objects', ['agent', 'terminal', 'combination', 'agent', 'terminal']],
    ['only agents', ['agent', 'agent', 'agent']],
    ['only terminals', ['terminal', 'terminal', 'terminal']],
    ['one agent', ['agent']],
    ['one combination', ['combination']]
  ] as const)('organizes %s around the canvas origin with stable separated regions', (_, kinds) => {
    const input = kinds.map((kind, index) => organizationItem(kind, index))
    const plan = createCanvasArrangementGridPlan(input, graph(), 'canvas')
    const placed = input.map((item) => ({
      ...item,
      position: plan.layouts.find((layout) => layout.key === item.key)!.position
    }))

    expect(boundsCenter(placed.map((item) => ({ ...item.size, position: item.position })))).toEqual(
      {
        x: 0,
        y: 0
      }
    )
    for (const left of placed) {
      for (const right of placed) {
        if (left.key === right.key) continue
        expect(
          left.position.x + left.size.width <= right.position.x ||
            right.position.x + right.size.width <= left.position.x ||
            left.position.y + left.size.height <= right.position.y ||
            right.position.y + right.size.height <= left.position.y
        ).toBe(true)
        if (left.reference.kind === 'agent' && right.reference.kind !== 'agent') {
          expect(left.position.x + left.size.width).toBeLessThan(right.position.x)
        }
      }
    }
    expect(createCanvasArrangementGridPlan([...placed].reverse(), graph(), 'canvas')).toEqual(plan)
  })

  it('organizes a complete workflow using its compact final footprint', () => {
    const input = [organizationItem('agent', 0), ...items()]
    const plan = createCanvasArrangementGridPlan(input, graph(), 'canvas')
    const first = plan.nodePositionsById.get('terminal-1')!
    const second = plan.nodePositionsById.get('terminal-2')!
    const agent = plan.layouts.find((layout) => layout.key === input[0]!.key)!

    expect(second).toEqual({ x: first.x + 164, y: first.y })
    expect(agent.position.x + input[0]!.size.width).toBeLessThan(first.x)
    expect(plan.bounds).toEqual(expect.objectContaining({ x: expect.any(Number) }))
    expect(plan.bounds.x + plan.bounds.width / 2).toBe(0)
    expect(plan.bounds.y + plan.bounds.height / 2).toBe(0)
  })

  it('compacts a workflow without moving the center of the original selection', () => {
    const plan = createCanvasArrangementGridPlan(items(), graph())
    const workflowLayout = plan.layouts.find(
      (layout) => layout.key === 'workflow:terminal-1,terminal-2'
    )!
    const terminalLayout = plan.layouts.find((layout) => layout.key === 'terminal:terminal-3')!
    const first = plan.nodePositionsById.get('terminal-1')!
    const second = plan.nodePositionsById.get('terminal-2')!

    expect(second).toEqual({ x: first.x + 164, y: first.y })
    expect(
      boundsCenter([
        { height: 80, position: workflowLayout.position, width: 264 },
        { height: 80, position: terminalLayout.position, width: 100 }
      ])
    ).toEqual({ x: 700, y: 240 })
  })
})

function organizationItem(
  kind: 'agent' | 'terminal' | 'combination',
  index: number
): CanvasArrangementSelectionItem {
  const id = `object-${index}`
  return {
    key: `${kind}:${id}`,
    nodeIds: [id],
    position: { x: 2_000 - index * 600, y: -900 + index * 400 },
    reference:
      kind === 'agent'
        ? { kind, agentId: id }
        : kind === 'terminal'
          ? { kind, terminalId: id }
          : { kind, terminalGroupId: id },
    size: { width: index % 2 === 0 ? 720 : 430, height: index % 3 === 0 ? 460 : 300 }
  }
}

function items(): CanvasArrangementSelectionItem[] {
  return [
    {
      key: 'workflow:terminal-1,terminal-2',
      nodeIds: ['terminal-1', 'terminal-2'],
      position: { x: 0, y: 0 },
      reference: { kind: 'workflow', terminalIds: ['terminal-1', 'terminal-2'] },
      size: { height: 80, width: 1_400 }
    },
    {
      key: 'terminal:terminal-3',
      nodeIds: ['terminal-3'],
      position: { x: 0, y: 400 },
      reference: { kind: 'terminal', terminalId: 'terminal-3' },
      size: { height: 80, width: 100 }
    }
  ]
}

function graph(): BlockGraphSnapshot {
  return {
    blocks: [
      { id: 'terminal-1', position: { x: 0, y: 0 }, size: { height: 80, width: 100 } },
      { id: 'terminal-2', position: { x: 1_300, y: 0 }, size: { height: 80, width: 100 } },
      { id: 'terminal-3', position: { x: 0, y: 400 }, size: { height: 80, width: 100 } }
    ],
    connections: [{ sourceBlockId: 'terminal-1', targetBlockId: 'terminal-2' }],
    terminalGroups: []
  } as unknown as BlockGraphSnapshot
}

function boundsCenter(
  regions: readonly {
    readonly height: number
    readonly position: { readonly x: number; readonly y: number }
    readonly width: number
  }[]
): { readonly x: number; readonly y: number } {
  const left = Math.min(...regions.map((region) => region.position.x))
  const top = Math.min(...regions.map((region) => region.position.y))
  const right = Math.max(...regions.map((region) => region.position.x + region.width))
  const bottom = Math.max(...regions.map((region) => region.position.y + region.height))
  return { x: (left + right) / 2, y: (top + bottom) / 2 }
}
