import { render } from '@testing-library/react'

import { MinimapContinuousRect } from '../../../src/presentation/app-shell/workbench/minimap/MinimapContinuousRect'
import { MinimapWorkbenchNode } from '../../../src/presentation/app-shell/workbench/minimap/MinimapWorkbenchNode'

const variants = [
  { variant: 'terminal' as const, selector: '.canvas-minimap__node-shell' },
  { variant: 'agentConsole' as const, selector: '.canvas-minimap__agent-shell' },
  { variant: 'terminalGroup' as const, selector: '.canvas-minimap__group-shell' }
]

describe('minimap continuous corners', () => {
  it.each([
    { width: 24, height: 14, radius: 7 },
    { width: 14, height: 14, radius: 7 },
    { width: 24, height: 14, radius: 0 }
  ])(
    'preserves a circular, capsule or square outline ($width × $height, $radius)',
    ({ width, height, radius }) => {
      const { container } = render(
        <svg>
          <MinimapContinuousRect x={2} y={3} width={width} height={height} rx={radius} />
        </svg>
      )
      const outline = container.querySelector('rect')!
      expect(outline).toHaveAttribute('x', '2')
      expect(outline).toHaveAttribute('y', '3')
      expect(outline).toHaveAttribute('width', String(width))
      expect(outline).toHaveAttribute('height', String(height))
      expect(outline).toHaveAttribute('rx', String(radius))
    }
  )

  it.each(variants)(
    'keeps the original circular corner size with a continuous contour for $variant',
    ({ variant, selector }) => {
      const { container } = render(
        <svg>
          <MinimapWorkbenchNode
            id="node"
            variant={variant}
            kindLabel="Node"
            x={12}
            y={18}
            width={120}
            height={80}
            borderRadius={12}
            className="canvas-minimap__node"
            selected={false}
          />
        </svg>
      )
      const outline = container.querySelector(selector)!
      const diagonal = readFirstCornerDiagonal(outline)

      expect(diagonal.x).toBeCloseTo(12 + 120 - 12 + 12 * Math.SQRT1_2, 3)
      expect(diagonal.y).toBeCloseTo(18 + 12 - 12 * Math.SQRT1_2, 3)
      expect(container.querySelectorAll('circle').length).toBe(
        variant === 'terminalGroup' ? 3 : variant === 'terminal' ? 1 : 0
      )
    }
  )
})

function readFirstCornerDiagonal(outline: Element) {
  if (outline.localName === 'rect') {
    const x = Number(outline.getAttribute('x'))
    const y = Number(outline.getAttribute('y'))
    const width = Number(outline.getAttribute('width'))
    const radius = Number(outline.getAttribute('rx'))
    return {
      x: x + width - radius + radius * Math.SQRT1_2,
      y: y + radius - radius * Math.SQRT1_2
    }
  }
  const corner = outline.getAttribute('d')!.split('C')[1]!
  const values = corner
    .match(/-?\d+(?:\.\d+)?/g)!
    .slice(0, 6)
    .map(Number)
  return { x: values[4], y: values[5] }
}
