import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import {
  resolveWorkbenchViewportTransition,
  transitionWorkbenchViewport
} from '../../../src/presentation/app-shell/workbenchViewportMotion'

describe('workbench viewport motion', () => {
  it.each([
    {
      commandType: 'zoom-in' as const,
      expected: { duration: 160 },
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'fit-view' as const,
      expected: { duration: 180 },
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'center' as const,
      expected: { duration: 220 },
      intent: { type: 'spatial' as const }
    },
    {
      commandType: 'set-viewport' as const,
      expected: { duration: 220, interpolate: 'linear' as const },
      intent: { path: 'direct' as const, type: 'spatial' as const }
    },
    {
      commandType: 'set-viewport' as const,
      expected: { duration: 0 },
      intent: { type: 'instant' as const }
    }
  ])('maps $intent.type $commandType motion to one shared rhythm', (input) => {
    expect(
      resolveWorkbenchViewportTransition({
        commandType: input.commandType,
        intent: input.intent,
        reducedMotion: false
      })
    ).toEqual(input.expected)
  })

  it('removes non-essential spatial movement when reduced motion is preferred', () => {
    expect(
      resolveWorkbenchViewportTransition({
        commandType: 'set-viewport',
        intent: { path: 'direct', type: 'spatial' },
        reducedMotion: true
      })
    ).toEqual({ duration: 0, interpolate: 'linear' })
  })

  it('gives distant focus targets more time without allowing unbounded motion', () => {
    const sharedInput = {
      commandType: 'center' as const,
      currentViewport: { x: 0, y: 0, zoom: 1 },
      intent: {
        canvasSize: { height: 640, width: 960 },
        source: 'minimap' as const,
        type: 'adaptive-focus' as const
      },
      reducedMotion: false,
      targetZoom: 1
    }

    const nearby = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetCenter: { x: 480, y: 320 }
    })
    const distant = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetCenter: { x: 1_480, y: 1_070 }
    })
    const extremelyDistant = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetCenter: { x: 40_480, y: 30_320 }
    })

    expect(nearby).toEqual({ duration: 180, interpolate: 'linear' })
    expect(distant.duration).toBeGreaterThan(nearby.duration)
    expect(distant.duration).toBeLessThanOrEqual(300)
    expect(extremelyDistant).toEqual({ duration: 300, interpolate: 'linear' })
  })

  it('forwards every viewport command through the shared transition options', async () => {
    const setCenter = vi.fn(async () => true)
    const setViewport = vi.fn(async () => true)
    const fitView = vi.fn(async () => true)
    const fitBounds = vi.fn(async () => true)
    const zoomIn = vi.fn(async () => true)
    const zoomOut = vi.fn(async () => true)
    const instance = {
      fitBounds,
      fitView,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter,
      setViewport,
      zoomIn,
      zoomOut
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    const node = { id: 'terminal-1' } as WorkbenchFlowNode

    await transitionWorkbenchViewport(instance, {
      center: { x: 120, y: 80 },
      intent: { type: 'spatial' },
      type: 'center',
      zoom: 0.9
    })
    await transitionWorkbenchViewport(instance, {
      intent: { type: 'instant' },
      type: 'set-viewport',
      viewport: { x: 10, y: 20, zoom: 0.8 }
    })
    await transitionWorkbenchViewport(instance, {
      intent: { type: 'spatial' },
      maxZoom: 1,
      nodes: [node],
      padding: 0.24,
      type: 'fit-view'
    })
    await transitionWorkbenchViewport(instance, {
      bounds: { height: 300, width: 400, x: 50, y: 60 },
      intent: { type: 'spatial' },
      padding: 0.24,
      type: 'fit-bounds'
    })
    await transitionWorkbenchViewport(instance, {
      intent: { type: 'quick' },
      type: 'zoom-in'
    })
    await transitionWorkbenchViewport(instance, {
      intent: { type: 'quick' },
      type: 'zoom-out'
    })

    expect(setCenter).toHaveBeenCalledWith(120, 80, { duration: 220, zoom: 0.9 })
    expect(setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 0.8 }, { duration: 0 })
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      maxZoom: 1,
      nodes: [node],
      padding: 0.24
    })
    expect(fitBounds).toHaveBeenCalledWith(
      { height: 300, width: 400, x: 50, y: 60 },
      { duration: 220, padding: 0.24 }
    )
    expect(zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(zoomOut).toHaveBeenCalledWith({ duration: 160 })
  })
})
