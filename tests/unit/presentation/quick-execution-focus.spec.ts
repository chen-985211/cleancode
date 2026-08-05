import type { Edge, ReactFlowInstance } from '@xyflow/react'

import { focusQuickExecutionTargetInCanvas } from '../../../src/presentation/app-shell/quickExecutionFocus'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'

describe('quick execution canvas focus', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    {
      expectedNodeIds: ['terminal-1'],
      target: { type: 'terminal' as const, terminalBlockId: 'terminal-1' }
    },
    {
      expectedNodeIds: ['terminal-1', 'terminal-2'],
      target: {
        type: 'workflow' as const,
        terminalBlockIds: ['terminal-1', 'terminal-2']
      }
    },
    {
      expectedNodeIds: ['combination-1'],
      target: { type: 'combination' as const, terminalGroupId: 'combination-1' }
    }
  ])('fits the complete $target.type target into the canvas', ({ expectedNodeIds, target }) => {
    const nodes = [
      createNode('terminal-1', 'terminal'),
      createNode('terminal-2', 'terminal'),
      createNode('combination-1', 'terminalGroup')
    ]
    const getNodesBounds = vi.fn(() => ({ height: 100, width: 120, x: 0, y: 0 }))
    const setViewport = vi.fn(async () => true)
    const instance = {
      getNode: (nodeId: string) => nodes.find((node) => node.id === nodeId),
      getNodesBounds,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

    expect(focusQuickExecutionTargetInCanvas({ instance, target })).toBe(true)
    expect(getNodesBounds).toHaveBeenCalledWith(
      expectedNodeIds.map((nodeId) => expect.objectContaining({ id: nodeId }))
    )
    expect(setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
  })

  it('does not move the canvas when any target node is unavailable', () => {
    const setViewport = vi.fn(async () => true)
    const instance = {
      getNode: () => undefined,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

    expect(
      focusQuickExecutionTargetInCanvas({
        instance,
        target: { type: 'terminal', terminalBlockId: 'removed-terminal' }
      })
    ).toBe(false)
    expect(setViewport).not.toHaveBeenCalled()
  })
})

function createNode(id: string, type: 'terminal' | 'terminalGroup'): WorkbenchFlowNode {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    type
  } as WorkbenchFlowNode
}

function stubReducedMotionPreference(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
}
