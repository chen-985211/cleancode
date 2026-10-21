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
      expect(path()).toMatch(/600,440$/)
      nodes.get('source')!.internals.positionAbsolute = { x: 200, y: 350 }
      rerender(
        <svg>
          <TerminalDependencyEdge {...props} sourceX={424.5} sourceY={372} />
        </svg>
      )
      expect(path()).toMatch(/^M420,372 C/)
      expect(path()).toMatch(/600,440$/)
    }
  )
})
