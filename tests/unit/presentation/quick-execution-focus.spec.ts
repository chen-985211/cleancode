import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import { motionPreferenceStore } from '../../../src/presentation/shared/motion/motionPreference'

import type { TerminalGroupSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { focusQuickExecutionTargetInCanvas } from '../../../src/presentation/app-shell/workbench/viewport/quickExecutionFocus'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  cancelWorkbenchViewportMotion,
  setWorkbenchViewportReducedMotion,
  transitionWorkbenchViewport
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

describe('quick execution canvas focus', () => {
  beforeEach(() => {
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(true)
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    document.body.append(canvas)
  })

  afterEach(() => {
    cancelWorkbenchViewportMotion()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('inherits the pending focus zoom instead of a temporary mid-flight zoom', () => {
    vi.spyOn(motionPreferenceStore, 'getSnapshot').mockReturnValue(false)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const setViewport = vi.fn(async () => true)
    const instance = {
      getNode: (id: string) => createNode(id, 'terminal'),
      getNodesBounds: () => ({ x: 1700, y: 600, width: 240, height: 100 }),
      getViewport: () => ({ x: 0, y: 0, zoom: 0.8 }),
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    void transitionWorkbenchViewport(instance, {
      type: 'center',
      center: { x: 2000, y: 700 },
      zoom: 1.6,
      intent: { type: 'adaptive-focus', canvasSize: { width: 1024, height: 768 } }
    })
    focusQuickExecutionTargetInCanvas({
      instance,
      target: { type: 'workflow', terminalBlockIds: ['terminal-1', 'terminal-2'] },
      terminalGroups: []
    })
    setWorkbenchViewportReducedMotion(true, instance)
    expect(setViewport).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 1.6 }), {
      duration: 0
    })
  })

  it.each([
    { type: 'terminal' as const, terminalBlockId: 'terminal-1' },
    { type: 'workflow' as const, terminalBlockIds: ['terminal-1', 'terminal-2'] },
    { type: 'combination' as const, terminalGroupId: 'combination-1' }
  ])('uses the directional focus zoom policy for a compact $type', (target) => {
    for (const [currentZoom, expectedZoom] of [
      [1.6, 1.6],
      [0.96, 0.96],
      [0.5, 1]
    ]) {
      const setViewport = vi.fn(async () => true)
      const instance = {
        getNode: (id: string) => createNode(id, 'terminal'),
        getNodesBounds: () => ({ x: 1700, y: 600, width: 240, height: 100 }),
        getViewport: () => ({ x: 0, y: 0, zoom: currentZoom }),
        setViewport
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
      focusQuickExecutionTargetInCanvas({ instance, target, terminalGroups: [] })
      expect(setViewport).toHaveBeenCalledWith(expect.objectContaining({ zoom: expectedZoom }), {
        duration: 0
      })
    }
  })

  it.each([
    { type: 'terminal' as const, terminalBlockId: 'terminal-1' },
    { type: 'workflow' as const, terminalBlockIds: ['terminal-1', 'terminal-2'] },
    { type: 'combination' as const, terminalGroupId: 'combination-1' }
  ])(
    'centers the complete $type inside the visible safe viewport at different window sizes',
    (target) => {
      for (const width of [1000, 1900]) {
        document.body.replaceChildren()
        const canvas = document.createElement('div')
        canvas.className = 'react-flow'
        canvas.getBoundingClientRect = () => new DOMRect(280, 0, width, 900)
        Object.defineProperties(canvas, {
          clientWidth: { value: width },
          clientHeight: { value: 900 }
        })
        document.body.append(canvas)
        for (const rect of [new DOMRect(300, 0, 180, 220), new DOMRect(600, 800, 300, 50)]) {
          const obstruction = document.createElement('div')
          obstruction.setAttribute('data-workbench-canvas-obstruction', '')
          obstruction.getBoundingClientRect = () => rect
          document.body.append(obstruction)
        }
        const bounds = { x: 1700, y: -600, width: 900, height: 400 }
        const setViewport = vi.fn<(viewport: Viewport) => Promise<boolean>>(async () => true)
        const instance = {
          getNode: (id: string) =>
            createNode(id, id === 'combination-1' ? 'terminalGroup' : 'terminal'),
          getNodesBounds: () => bounds,
          getViewport: () => ({ x: -200, y: 40, zoom: 0.5 }),
          setViewport
        } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
        expect(focusQuickExecutionTargetInCanvas({ instance, target, terminalGroups: [] })).toBe(
          true
        )
        const viewport = setViewport.mock.calls[0]![0] as { x: number; y: number; zoom: number }
        const left = bounds.x * viewport.zoom + viewport.x
        const top = bounds.y * viewport.zoom + viewport.y
        expect(Math.abs(left + (bounds.width * viewport.zoom) / 2 - width / 2)).toBeLessThan(2)
        expect(Math.abs(top + (bounds.height * viewport.zoom) / 2 - 510)).toBeLessThan(2)
        expect(left).toBeGreaterThanOrEqual(24)
        expect(left + bounds.width * viewport.zoom).toBeLessThanOrEqual(width - 24)
        expect(top).toBeGreaterThanOrEqual(244)
        expect(top + bounds.height * viewport.zoom).toBeLessThanOrEqual(776)
      }
    }
  )

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

    const focusRequest = { instance, target, terminalGroups: [] }

    expect(focusQuickExecutionTargetInCanvas(focusRequest)).toBe(true)
    expect(getNodesBounds).toHaveBeenCalledWith(
      expectedNodeIds.map((nodeId) => expect.objectContaining({ id: nodeId }))
    )
    expect(setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
  })

  it.each([
    {
      target: { type: 'terminal' as const, terminalBlockId: 'terminal-1' },
      terminalBlockIds: ['terminal-1']
    },
    {
      target: {
        type: 'workflow' as const,
        terminalBlockIds: ['terminal-1', 'terminal-2']
      },
      terminalBlockIds: ['terminal-1', 'terminal-2']
    }
  ])(
    'fits the collapsed combination that visibly represents a $target.type target',
    ({ target, terminalBlockIds }) => {
      const group = createTerminalGroup('combination-1', terminalBlockIds, true)
      const groupNode = createNode(group.id, 'terminalGroup')
      const getNodesBounds = vi.fn(() => ({ height: 100, width: 120, x: 0, y: 0 }))
      const setViewport = vi.fn(async () => true)
      const instance = {
        getNode: (nodeId: string) => (nodeId === groupNode.id ? groupNode : undefined),
        getNodesBounds,
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        setViewport
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
      const focusRequest = {
        instance,
        target,
        terminalGroups: [group]
      }

      expect(focusQuickExecutionTargetInCanvas(focusRequest)).toBe(true)
      expect(getNodesBounds).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'combination-1' })
      ])
      expect(setViewport).toHaveBeenCalledWith(expect.any(Object), { duration: 0 })
    }
  )

  it('keeps members of an expanded combination as the visible focus targets', () => {
    const terminalNode = createNode('terminal-1', 'terminal')
    const getNodesBounds = vi.fn(() => ({ height: 100, width: 120, x: 0, y: 0 }))
    const setViewport = vi.fn(async () => true)
    const instance = {
      getNode: (nodeId: string) => (nodeId === terminalNode.id ? terminalNode : undefined),
      getNodesBounds,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    const focusRequest = {
      instance,
      target: { type: 'terminal' as const, terminalBlockId: terminalNode.id },
      terminalGroups: [createTerminalGroup('combination-1', [terminalNode.id], false)]
    }

    expect(focusQuickExecutionTargetInCanvas(focusRequest)).toBe(true)
    expect(getNodesBounds).toHaveBeenCalledWith([expect.objectContaining({ id: terminalNode.id })])
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
        target: { type: 'terminal', terminalBlockId: 'removed-terminal' },
        terminalGroups: []
      })
    ).toBe(false)
    expect(setViewport).not.toHaveBeenCalled()
  })

  it.each(['hidden', 'empty', 'unmounted'] as const)(
    'leaves the viewport alone when the focus target is %s',
    (state) => {
      if (state === 'unmounted') document.body.replaceChildren()
      const setViewport = vi.fn(async () => true)
      const instance = {
        getNode: (id: string) => ({ ...createNode(id, 'terminal'), hidden: state === 'hidden' }),
        getNodesBounds: vi.fn(),
        setViewport
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
      expect(
        focusQuickExecutionTargetInCanvas({
          instance,
          target: { type: 'workflow', terminalBlockIds: state === 'empty' ? [] : ['terminal-1'] },
          terminalGroups: []
        })
      ).toBe(false)
      expect(setViewport).not.toHaveBeenCalled()
    }
  )
})

function createNode(id: string, type: 'terminal' | 'terminalGroup'): WorkbenchFlowNode {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    type
  } as WorkbenchFlowNode
}

function createTerminalGroup(
  id: string,
  memberBlockIds: readonly string[],
  isCollapsed: boolean
): TerminalGroupSnapshot {
  return {
    id,
    isCollapsed,
    memberBlockIds,
    name: id,
    position: { x: 0, y: 0 },
    size: { height: 100, width: 120 },
    type: 'terminal-group'
  }
}
