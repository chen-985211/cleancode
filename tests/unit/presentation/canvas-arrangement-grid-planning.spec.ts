import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createCanvasArrangementGridPlan } from '../../../src/presentation/app-shell/canvasArrangementGridPlanning'
import type { CanvasArrangementSelectionItem } from '../../../src/presentation/app-shell/canvasArrangementSelection'

describe('canvas arrangement grid planning', () => {
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
