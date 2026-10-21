import { render } from '@testing-library/react'
import { Position, type EdgeProps } from '@xyflow/react'
import type * as ReactFlowModule from '@xyflow/react'
import { TerminalDependencyEdge } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalDependencyEdge'

const graph = vi.hoisted(() => ({ getInternalNode: vi.fn() }))
vi.mock('@xyflow/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactFlowModule>()),
  useReactFlow: () => graph,
  BaseEdge: ({ path }: { path: string }) => <path d={path} />
}))

describe('terminal dependency edge attachment', () => {
  it('follows live resize dimensions before the persisted style is updated', () => {
    graph.getInternalNode.mockReturnValue({
      internals: { positionAbsolute: { x: 100, y: 200 } },
      style: { width: 420, height: 280 },
      width: 580,
      height: 360,
      measured: { width: 580, height: 360 },
      resizing: true,
      data: {}
    })
    const { container } = render(
      <svg>
        <TerminalDependencyEdge
          {...({
            id: 'resize',
            source: 'source',
            target: 'target',
            sourcePosition: Position.Right,
            targetPosition: Position.Left
          } as EdgeProps)}
        />
      </svg>
    )
    expect(container.querySelector('path')!.getAttribute('d')).toMatch(/^M680,380 C/)
    expectPortJoin(container, { x: 100, y: 380 })
  })

  it.each([-260, 0, 260])('joins the arrow to the curve and port at targetY=%s', (targetY) => {
    graph.getInternalNode.mockImplementation((id: string) =>
      id === 'target'
        ? {
            internals: { positionAbsolute: { x: 400, y: targetY - 140 } },
            style: { width: 420, height: 280 },
            measured: {},
            data: {}
          }
        : undefined
    )
    const { container } = render(
      <svg>
        <TerminalDependencyEdge
          {...({
            id: 'arrow',
            source: 'source',
            target: 'target',
            markerEnd: 'existing-marker',
            sourceX: 0,
            sourceY: 0,
            targetX: 400,
            targetY,
            sourcePosition: Position.Right,
            targetPosition: Position.Left
          } as EdgeProps)}
        />
      </svg>
    )
    const marker = container.querySelector('marker')
    expect(marker).not.toBeNull()
    // The tip belongs at the path endpoint, whose tangent determines orientation.
    expect(Number(marker!.getAttribute('refX'))).toBe(10)
    expect(Number(marker!.getAttribute('refY'))).toBe(5)
    expect(marker!.getAttribute('orient')).toBe('auto')
    const { end, control } = expectPortJoin(container, { x: 400, y: targetY })
    // A sloped curve reaches the port with a sloped tangent, not a detached horizontal head.
    expect(Math.sign(end.y - control.y)).toBe(Math.sign(targetY))
  })

  it.each([false, true])(
    'attaches to the displayed node boundary while dragging=%s',
    (dragging) => {
      const nodes = new Map([
        [
          'source',
          {
            internals: { positionAbsolute: { x: 100, y: 250 } },
            style: { width: 220, height: 44 },
            measured: { width: 420, height: 280 },
            data: {},
            dragging
          }
        ],
        [
          'target',
          {
            internals: { positionAbsolute: { x: 600, y: 300 } },
            style: { width: 420, height: 280 },
            measured: { width: 220, height: 44 },
            data: {},
            dragging
          }
        ]
      ])
      graph.getInternalNode.mockImplementation((id: string) => nodes.get(id))
      const props = {
        id: 'dependency',
        source: 'source',
        target: 'target',
        sourceX: 324.5,
        sourceY: 272,
        targetX: 595.5,
        targetY: 440,
        sourcePosition: Position.Right,
        targetPosition: Position.Left
      } as EdgeProps
      const { container, rerender } = render(
        <svg>
          <TerminalDependencyEdge {...props} />
        </svg>
      )
      const path = () => container.querySelector('path')!.getAttribute('d')!
      expect(path()).toMatch(/^M320,272 C/)
      expectPortJoin(container, { x: 600, y: 440 })
      nodes.get('source')!.internals.positionAbsolute = { x: 200, y: 350 }
      rerender(
        <svg>
          <TerminalDependencyEdge {...props} sourceX={424.5} sourceY={372} />
        </svg>
      )
      expect(path()).toMatch(/^M420,372 C/)
      expectPortJoin(container, { x: 600, y: 440 })
    }
  )
})

function expectPortJoin(container: HTMLElement, target: { x: number; y: number }) {
  const points = container
    .querySelector('path')!
    .getAttribute('d')!
    .trim()
    .split(/[MC,\s]+/)
    .filter(Boolean)
    .map(Number)
  const end = { x: points[6]!, y: points[7]! }
  const control = { x: points[4]!, y: points[5]! }
  expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeCloseTo(4.5, 4)
  return { end, control }
}
