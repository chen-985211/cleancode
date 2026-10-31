import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import { useState } from 'react'

import { CanvasSettingsPane } from '../../../src/presentation/app-shell/app-features/settings/CanvasSettingsPane'
import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/app-features/shortcuts/useApplicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useCanvasSelectionViewport } from '../../../src/presentation/app-shell/workbench/viewport/useCanvasSelectionViewport'
import { cancelWorkbenchViewportMotion } from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

const safeViewport = { x: 24, y: 24, width: 912, height: 592 }
const cases = [
  { name: 'visible', x: 200, y: 180, width: 200, height: 160, zoom: 0.5 },
  { name: 'right edge', x: 850, y: 180, width: 200, height: 160, zoom: 1 },
  { name: 'left edge', x: -100, y: 180, width: 200, height: 160, zoom: 1 },
  { name: 'below', x: 200, y: 800, width: 200, height: 160, zoom: 1 },
  { name: 'above', x: 200, y: -600, width: 200, height: 160, zoom: 1 },
  { name: 'distant', x: 2000, y: 1800, width: 200, height: 160, zoom: 0.5 },
  { name: 'readable', x: 200, y: 180, width: 200, height: 160, zoom: 1 },
  { name: 'magnified', x: 850, y: 180, width: 200, height: 160, zoom: 1.25 },
  { name: 'oversized', x: 1200, y: 800, width: 1400, height: 1000, zoom: 1 }
]

describe('canvas node positioning mode', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    )
  })

  afterEach(() => {
    cancelWorkbenchViewportMotion()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it.each(['selection', 'shortcut'] as const)(
    '%s restores readable zoom even when the target is already visible',
    async (entry) => {
      const target = nodeAt(cases[0])
      const hook = renderFocus(target, { x: 0, y: 0, zoom: 0.5 })
      await act(async () => hook.focus(entry))
      expect(hook.instance.getViewport()).toEqual({ x: -176, y: -156, zoom: 1 })
      if (entry === 'shortcut') {
        expect(hook.select).toHaveBeenCalledWith(target)
        expect(hook.activate).toHaveBeenCalledWith(target)
      }
    }
  )

  it.each(['terminal', 'terminalGroup', 'agentConsole'] as const)(
    'reveals every %s through the same geometry contract from both entry points',
    async (type) => {
      for (const entry of ['selection', 'shortcut'] as const) {
        for (const scenario of cases) {
          const target = nodeAt(scenario, type)
          const before = { x: 0, y: 0, zoom: scenario.zoom }
          const hook = renderFocus(target, before)
          await act(async () => hook.focus(entry))
          const after = hook.instance.getViewport()
          expectContained(target, after, safeViewport)
          const centered = renderFocus(target, before)
          centered.rerender({ mode: 'center' })
          await act(async () => centered.focus(entry))
          expect(after.zoom).toBe(centered.instance.getViewport().zoom)
          centered.unmount()
          if (after.zoom === before.zoom) {
            // No axis moves farther than necessary to reveal the target.
            for (const [axis, size] of [
              ['x', 'width'],
              ['y', 'height']
            ] as const) {
              const leading = target.position[axis] * before.zoom
              const trailing = leading + scenario[size] * before.zoom
              const start = safeViewport[axis]
              const end = start + safeViewport[size]
              expect(after[axis]).toBeCloseTo(
                leading < start ? start - leading : trailing > end ? end - trailing : 0
              )
            }
          }
          hook.unmount()
        }
      }
    }
  )

  it('preserves fractional camera coordinates exactly for a fully visible target', async () => {
    const before = { x: 0.1, y: 0.3, zoom: 1.25 }
    const hook = renderFocus(nodeAt(cases[0]), before)
    await act(async () => hook.focus('selection'))
    expect(hook.instance.getViewport()).toEqual(before)
  })

  it('avoids actual toolbar obstructions instead of treating all canvas pixels as available', async () => {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 960, 640)
    const toolbar = document.createElement('div')
    toolbar.setAttribute('data-workbench-canvas-obstruction', 'true')
    toolbar.getBoundingClientRect = () => new DOMRect(0, 0, 960, 80)
    document.body.append(canvas, toolbar)
    const target = nodeAt({ x: 200, y: 50, width: 200, height: 160 })
    const hook = renderFocus(target, { x: 0, y: 0, zoom: 1 })
    await act(async () => hook.focus('selection'))
    expectContained(target, hook.instance.getViewport(), { ...safeViewport, y: 104, height: 512 })
    expect(hook.instance.getViewport()).toEqual({ x: 0, y: 54, zoom: 1 })
  })

  it('applies preference changes to both entry points without moving the camera when toggled', async () => {
    const target = nodeAt(cases[0])
    const hook = renderFocus(target, { x: 0, y: 0, zoom: 0.5 })
    hook.rerender({ mode: 'center' })
    expect(hook.instance.getViewport()).toEqual({ x: 0, y: 0, zoom: 0.5 })
    await act(async () => hook.focus('selection'))
    expect(hook.instance.getViewport()).toEqual({ x: 180, y: 60, zoom: 1 })
    hook.rerender({ mode: 'preserve-view' })
    await act(async () => hook.focus('shortcut'))
    expect(hook.instance.getViewport()).toEqual({ x: 180, y: 60, zoom: 1 })
  })

  it('keeps the camera still when canvas chrome leaves no safe region', async () => {
    const canvas = document.createElement('div')
    canvas.className = 'react-flow'
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 960, 640)
    const obstruction = document.createElement('div')
    obstruction.setAttribute('data-workbench-canvas-obstruction', 'true')
    obstruction.getBoundingClientRect = () => new DOMRect(0, 0, 960, 300)
    const bottom = document.createElement('div')
    bottom.setAttribute('data-workbench-canvas-obstruction', 'true')
    bottom.getBoundingClientRect = () => new DOMRect(0, 340, 960, 300)
    document.body.append(canvas, obstruction, bottom)
    const hook = renderFocus(nodeAt(cases[5]), { x: 0, y: 0, zoom: 0.5 })
    await act(async () => hook.focus('selection'))
    expect(hook.instance.getViewport()).toEqual({ x: 0, y: 0, zoom: 0.5 })
  })

  it('uses the existing segmented control with a changing description and keyboard selection', () => {
    function Settings() {
      const [mode, setMode] = useState<'center' | 'preserve-view'>('center')
      return (
        <CanvasSettingsPane
          zoomOnBlankClick
          onZoomOnBlankClickChange={vi.fn()}
          nodeFocusMode={mode}
          onNodeFocusModeChange={setMode}
          reduceVisualNoise={false}
          onReduceVisualNoiseChange={vi.fn()}
          followQuickExecutionTarget
          onFollowQuickExecutionTargetChange={vi.fn()}
        />
      )
    }
    render(<Settings />)
    const group = screen.getByRole('radiogroup', { name: '节点定位方式' })
    const center = within(group).getByRole('radio', { name: '居中显示' })
    const preserve = within(group).getByRole('radio', { name: '移入视野' })
    expect(center).toBeChecked()
    expect(group).toHaveAccessibleDescription('将选中的节点移到画布中央，并调整到合适的缩放比例。')
    fireEvent.keyDown(center, { key: 'ArrowRight' })
    expect(preserve).toBeChecked()
    expect(preserve).toHaveFocus()
    expect(group).toHaveAccessibleDescription(
      '调整到合适的缩放比例，并将节点就近移入画布可见区域。'
    )
    fireEvent.click(center)
    expect(center).toBeChecked()
  })
})

function nodeAt(
  bounds: { x: number; y: number; width: number; height: number },
  type: WorkbenchFlowNode['type'] = 'terminal'
): WorkbenchFlowNode {
  return {
    id: 'target',
    type,
    position: { x: bounds.x, y: bounds.y },
    measured: { width: bounds.width, height: bounds.height },
    data: type === 'terminalGroup' ? { group: { isCollapsed: true, memberBlockIds: [] } } : {}
  } as WorkbenchFlowNode
}

function expectContained(node: WorkbenchFlowNode, viewport: Viewport, safe: typeof safeViewport) {
  const left = node.position.x * viewport.zoom + viewport.x
  const top = node.position.y * viewport.zoom + viewport.y
  expect(left).toBeGreaterThanOrEqual(safe.x - 0.001)
  expect(top).toBeGreaterThanOrEqual(safe.y - 0.001)
  expect(left + node.measured!.width! * viewport.zoom).toBeLessThanOrEqual(
    safe.x + safe.width + 0.001
  )
  expect(top + node.measured!.height! * viewport.zoom).toBeLessThanOrEqual(
    safe.y + safe.height + 0.001
  )
}

function renderFocus(node: WorkbenchFlowNode, initialViewport: Viewport) {
  let viewport = initialViewport
  const instance = {
    getNode: () => node,
    getNodes: () => [node],
    getViewport: () => viewport,
    setViewport: vi.fn(async (next: Viewport) => {
      viewport = next
      return true
    })
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  const select = vi.fn()
  const activate = vi.fn()
  const hook = renderHook(
    ({ mode }: { mode: 'center' | 'preserve-view' }) => {
      const common = {
        canvasSizeRef: { current: { width: 960, height: 640 } },
        reactFlowInstanceRef: { current: instance },
        nodeFocusMode: mode
      }
      return {
        selection: useCanvasSelectionViewport({ ...common, onUserAction: vi.fn() }),
        shortcut: useApplicationShortcutNavigation({
          ...common,
          activateWorkbenchNodeInput: activate,
          selectWorkbenchNode: select,
          currentWorkbench: null,
          getNodes: () => [node],
          onSelectWorkspace: vi.fn(),
          revealProjectSidebar: vi.fn(),
          selectedNodeId: null,
          workbenches: []
        })
      }
    },
    { initialProps: { mode: 'preserve-view' } }
  )
  return {
    ...hook,
    instance,
    select,
    activate,
    focus: (entry: 'selection' | 'shortcut') => {
      if (entry === 'selection') hook.result.current.selection.focusSelectedWorkbenchNode(node.id)
      else {
        const center = (480 - viewport.x) / viewport.zoom
        hook.result.current.shortcut.selectCanvasNode(
          node.position.x + node.measured!.width! / 2 > center ? 'right' : 'left'
        )
      }
    }
  }
}
