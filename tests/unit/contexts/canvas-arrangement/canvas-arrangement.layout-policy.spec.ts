import {
  createExpandedCanvasLayout,
  createGridCanvasLayout,
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

  it('expands a stack around its current anchor instead of restoring old coordinates', () => {
    const result = createExpandedCanvasLayout(
      [
        item('terminal:terminal-1', 270, 70, 420, 240),
        item('workflow:terminal-2,terminal-3', 280, 80, 900, 300),
        item('agent:agent-1', 290, 90, 720, 460)
      ],
      { x: 270, y: 70 }
    )

    expect(result.layouts).toEqual([
      layout('terminal:terminal-1', -348, 204),
      layout('workflow:terminal-2,terminal-3', 120, 150),
      layout('agent:agent-1', 1_068, 94)
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
