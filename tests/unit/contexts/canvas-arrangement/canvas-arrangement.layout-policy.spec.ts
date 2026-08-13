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
      layout('terminal:terminal-1', 235, 205),
      layout('workflow:terminal-2,terminal-3', 245, 215),
      layout('agent:agent-1', 255, 225),
      layout('combination:group-1', 265, 235)
    ])
  })

  it('places detached objects along one ordered diagonal while keeping them overlapped', () => {
    const attachedItems = [
      item('terminal:terminal-1', 235, 205, 420, 240),
      item('workflow:terminal-2,terminal-3', 245, 215, 900, 300),
      item('agent:agent-1', 255, 225, 720, 460),
      item('combination:group-1', 265, 235, 960, 600)
    ]
    const result = createSpreadCanvasLayout(attachedItems, { x: 235, y: 205 })

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', 235, 205),
      layout('workflow:terminal-2,terminal-3', 291, 243),
      layout('agent:agent-1', 347, 281),
      layout('combination:group-1', 403, 319)
    ])
    expect(
      hasOverlap(result.layouts[0]!, attachedItems[0]!, result.layouts[1]!, attachedItems[1]!)
    ).toBe(true)
    expect(
      result.layouts.map((layout, index) => movementFrom(attachedItems[index]!, layout))
    ).toEqual([
      { x: 0, y: 0 },
      { x: 46, y: 28 },
      { x: 92, y: 56 },
      { x: 138, y: 84 }
    ])
  })

  it('reattaches detached objects at the same anchor without restoring historical positions', () => {
    const result = createStackedCanvasLayout(
      [
        item('terminal:terminal-1', 235, 205, 420, 240),
        item('workflow:terminal-2,terminal-3', 291, 243, 900, 300),
        item('agent:agent-1', 347, 281, 720, 460),
        item('combination:group-1', 403, 319, 960, 600)
      ],
      { x: 235, y: 205 }
    )

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', 235, 205),
      layout('workflow:terminal-2,terminal-3', 245, 215),
      layout('agent:agent-1', 255, 225),
      layout('combination:group-1', 265, 235)
    ])
  })

  it('sorts mixed sizes by footprint and packs them into centered shelves without overlap', () => {
    const result = createGridCanvasLayout([
      item('agent:agent-1', 700, 80, 720, 460),
      item('terminal:terminal-1', 40, 40, 420, 240),
      item('workflow:terminal-2,terminal-3', 500, 40, 900, 300),
      item('combination:group-1', 40, 400, 960, 600)
    ])

    expect(result.layouts).toEqual([
      layout('combination:group-1', 46, -208),
      layout('agent:agent-1', 46, 440),
      layout('workflow:terminal-2,terminal-3', 46, 948),
      layout('terminal:terminal-1', 994, 1_008)
    ])
  })

  it('reuses each shelf width instead of inheriting oversized columns from another row', () => {
    const input = [
      item('combination:group-1', 0, 0, 800, 270),
      item('agent:agent-1', 900, 0, 360, 270),
      item('agent:agent-2', 1_700, 0, 360, 220),
      item('terminal:terminal-1', 0, 400, 320, 200),
      item('terminal:terminal-2', 900, 400, 320, 200),
      item('terminal:terminal-3', 1_400, 400, 320, 200)
    ]
    const result = createGridCanvasLayout(input)

    expect(result.layouts).toEqual([
      layout('combination:group-1', 502, -118),
      layout('agent:agent-1', 502, 200),
      layout('agent:agent-2', 910, 250),
      layout('terminal:terminal-1', 502, 518),
      layout('terminal:terminal-2', 870, 518),
      layout('terminal:terminal-3', 1_238, 518)
    ])
    expect(layoutBounds(result.layouts, input)).toEqual({ height: 836, width: 1_056 })
  })

  it('preserves visual reading order when objects have the same footprint', () => {
    const result = createGridCanvasLayout([
      item('terminal:third', 700, 400, 320, 200),
      item('terminal:second', 500, 40, 320, 200),
      item('terminal:first', 40, 40, 320, 200)
    ])

    expect(result.layouts.map((entry) => entry.key)).toEqual([
      'terminal:first',
      'terminal:second',
      'terminal:third'
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

function layoutBounds(
  layouts: readonly ReturnType<typeof layout>[],
  items: readonly CanvasArrangementLayoutItem[]
): { readonly height: number; readonly width: number } {
  const itemByKey = new Map(items.map((item) => [item.key, item]))
  const left = Math.min(...layouts.map((entry) => entry.position.x))
  const top = Math.min(...layouts.map((entry) => entry.position.y))
  const right = Math.max(
    ...layouts.map((entry) => entry.position.x + itemByKey.get(entry.key)!.size.width)
  )
  const bottom = Math.max(
    ...layouts.map((entry) => entry.position.y + itemByKey.get(entry.key)!.size.height)
  )
  return { height: bottom - top, width: right - left }
}
