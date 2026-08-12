import {
  createGridCanvasLayout,
  createSpreadCanvasLayout,
  createStackedCanvasLayout
} from '../../../../src/contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy'
import type { CanvasArrangementLayoutItem } from '../../../../src/contexts/canvas-arrangement/domain/services/CanvasArrangementLayoutPolicy'

describe('canvas arrangement layout policy', () => {
  it('stacks mixed canvas objects as whole visual units in stable visual order', () => {
    const result = createStackedCanvasLayout([
      item('agent:agent-1', 700, 80, 720, 460),
      item('terminal:terminal-1', 40, 40, 420, 240),
      item('workflow:terminal-2,terminal-3', 500, 40, 900, 300),
      item('combination:group-1', 40, 400, 960, 600)
    ])

    expect(result.anchor).toEqual({ x: 235, y: 205 })
    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', 505, 385),
      layout('workflow:terminal-2,terminal-3', 275, 365),
      layout('agent:agent-1', 375, 295),
      layout('combination:group-1', 265, 235)
    ])
  })

  it('spreads one stack along one ordered diagonal while keeping the objects overlapped', () => {
    const stackedItems = [
      item('terminal:terminal-1', 505, 385, 420, 240),
      item('workflow:terminal-2,terminal-3', 275, 365, 900, 300),
      item('agent:agent-1', 375, 295, 720, 460),
      item('combination:group-1', 265, 235, 960, 600)
    ]
    const result = createSpreadCanvasLayout(stackedItems, { x: 235, y: 205 })

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', 505, 385),
      layout('workflow:terminal-2,terminal-3', 321, 393),
      layout('agent:agent-1', 467, 351),
      layout('combination:group-1', 403, 319)
    ])
    expect(
      hasOverlap(result.layouts[0]!, stackedItems[0]!, result.layouts[1]!, stackedItems[1]!)
    ).toBe(true)
    expect(
      result.layouts.map((layout, index) => movementFrom(stackedItems[index]!, layout))
    ).toEqual([
      { x: 0, y: 0 },
      { x: 46, y: 28 },
      { x: 92, y: 56 },
      { x: 138, y: 84 }
    ])
  })

  it('collapses a spread stack back to the same anchor without restoring historical positions', () => {
    const result = createStackedCanvasLayout(
      [
        item('terminal:terminal-1', 505, 385, 420, 240),
        item('workflow:terminal-2,terminal-3', 321, 393, 900, 300),
        item('agent:agent-1', 467, 351, 720, 460),
        item('combination:group-1', 403, 319, 960, 600)
      ],
      { x: 235, y: 205 }
    )

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', 505, 385),
      layout('workflow:terminal-2,terminal-3', 275, 365),
      layout('agent:agent-1', 375, 295),
      layout('combination:group-1', 265, 235)
    ])
  })

  it('arranges mixed sizes into a centered near-square grid without overlap', () => {
    const result = createGridCanvasLayout([
      item('agent:agent-1', 700, 80, 720, 460),
      item('terminal:terminal-1', 40, 40, 420, 240),
      item('workflow:terminal-2,terminal-3', 500, 40, 900, 300),
      item('combination:group-1', 40, 400, 960, 600)
    ])

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', -134, 46),
      layout('workflow:terminal-2,terminal-3', 634, 46),
      layout('agent:agent-1', -134, 394),
      layout('combination:group-1', 634, 394)
    ])
  })

  it('rejects fewer than two objects and duplicate object keys', () => {
    expect(() => createStackedCanvasLayout([])).toThrow(
      'Canvas arrangement requires at least two objects.'
    )
    expect(() =>
      createGridCanvasLayout([
        item('terminal:terminal-1', 0, 0, 420, 240),
        item('terminal:terminal-1', 500, 0, 420, 240)
      ])
    ).toThrow('Canvas arrangement object keys must be unique.')
  })
})

function item(
  key: string,
  x: number,
  y: number,
  width: number,
  height: number
): CanvasArrangementLayoutItem {
  return { key, position: { x, y }, size: { width, height } }
}

function layout(key: string, x: number, y: number) {
  return { key, position: { x, y } }
}

function movementFrom(
  item: CanvasArrangementLayoutItem,
  target: ReturnType<typeof layout>
): { readonly x: number; readonly y: number } {
  return {
    x: target.position.x - item.position.x,
    y: target.position.y - item.position.y
  }
}

function hasOverlap(
  leftLayout: ReturnType<typeof layout>,
  leftItem: CanvasArrangementLayoutItem,
  rightLayout: ReturnType<typeof layout>,
  rightItem: CanvasArrangementLayoutItem
): boolean {
  return (
    leftLayout.position.x < rightLayout.position.x + rightItem.size.width &&
    leftLayout.position.x + leftItem.size.width > rightLayout.position.x &&
    leftLayout.position.y < rightLayout.position.y + rightItem.size.height &&
    leftLayout.position.y + leftItem.size.height > rightLayout.position.y
  )
}
