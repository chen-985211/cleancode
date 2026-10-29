import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { focusSelectedWorkbenchNodeInCanvas } from '../../../src/presentation/app-shell/workbench/viewport/focusSelectedWorkbenchNodeInCanvas'
import { resolveWorkbenchNodeRevealViewport } from '../../../src/presentation/app-shell/workbench/viewport/workbenchNodeRevealViewport'
import { cancelWorkbenchViewportMotion } from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

const canvasSize = { width: 960, height: 640 }

describe('preserve-view navigation motion', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance'
      ]
    })
  })
  afterEach(() => {
    cancelWorkbenchViewportMotion()
    vi.useRealTimers()
  })

  it('pans a distant node into view without temporary flight zoom', async () => {
    const instance = canvas()
    const completion = focus(instance, node(2000))
    await vi.advanceTimersByTimeAsync(150)
    expect(instance.getViewport().zoom).toBe(1)
    expect(instance.getViewport().x).toBeLessThan(0)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await completion).toBe(true)
    expect(instance.getViewport()).toEqual({ x: -1264, y: 0, zoom: 1 })
  })

  it('cancels an old pan when the new target is already visible', async () => {
    const instance = canvas()
    const first = focus(instance, node(2000))
    await vi.advanceTimersByTimeAsync(100)
    const presented = { ...instance.getViewport() }
    const visible = node(100 - presented.x)
    const second = focus(instance, visible)
    await vi.advanceTimersByTimeAsync(1500)
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(instance.getViewport()).toEqual(presented)
  })

  it('inherits the intended scale when a new target interrupts a shrinking view', async () => {
    const instance = canvas()
    const first = focus(instance, node(2000, { width: 1400, height: 1000 }))
    await vi.advanceTimersByTimeAsync(100)
    expect(instance.getViewport().zoom).toBeGreaterThan(0.592)
    const second = focus(instance, node(-2000))
    await vi.advanceTimersByTimeAsync(1500)
    expect(await first).toBe(false)
    expect(await second).toBe(true)
    expect(instance.getViewport().zoom).toBe(0.592)
    expect(-2000 * 0.592 + instance.getViewport().x).toBeCloseTo(24)
  })

  it('respects the minimum zoom and centers only an axis that cannot fit', () => {
    const viewport = resolveWorkbenchNodeRevealViewport({
      bounds: { x: 0, y: 0, width: 10000, height: 100 },
      currentViewport: { x: 50, y: 100, zoom: 0.35 },
      targetZoom: 0.35,
      canvasSize,
      safeViewport: { x: 24, y: 24, width: 912, height: 592 }
    })
    expect(viewport).toEqual({ x: -1270, y: 100, zoom: 0.35 })
  })
})

function canvas() {
  let viewport: Viewport = { x: 0, y: 0, zoom: 1 }
  return {
    getViewport: () => viewport,
    setViewport: async (next: Viewport) => {
      viewport = next
      return true
    }
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

function node(x: number, size = { width: 200, height: 160 }): WorkbenchFlowNode {
  return {
    id: 'target',
    type: 'terminal',
    position: { x, y: 180 },
    measured: size,
    data: {}
  } as WorkbenchFlowNode
}

function focus(instance: ReactFlowInstance<WorkbenchFlowNode, Edge>, target: WorkbenchFlowNode) {
  return focusSelectedWorkbenchNodeInCanvas(instance, target, canvasSize, 'preserve-view')
}
