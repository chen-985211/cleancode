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
      expectedDuration: 180,
      expectedInterpolation: 'smooth' as const,
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'fit-view' as const,
      expectedDuration: 180,
      expectedInterpolation: 'smooth' as const,
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'center' as const,
      expectedDuration: 220,
      expectedInterpolation: 'smooth' as const,
      intent: { type: 'spatial' as const }
    },
    {
      commandType: 'set-viewport' as const,
      expectedDuration: 220,
      expectedInterpolation: 'smooth' as const,
      intent: { type: 'spatial' as const }
    }
  ])('maps $intent.type $commandType motion to one shared rhythm', (input) => {
    const transition = resolveWorkbenchViewportTransition({
      intent: input.intent,
      reducedMotion: false
    })

    expect(transition).toMatchObject({
      duration: input.expectedDuration,
      interpolate: input.expectedInterpolation
    })
    expect(transition.ease).toEqual(expect.any(Function))
    expect(transition.ease?.(0)).toBe(0)
    expect(transition.ease?.(0.5)).toBeCloseTo(0.875)
    expect(transition.ease?.(1)).toBe(1)
  })

  it('keeps instant and reduced-motion transitions free from spatial interpolation', () => {
    expect(
      resolveWorkbenchViewportTransition({
        intent: { type: 'instant' },
        reducedMotion: false
      })
    ).toEqual({ duration: 0 })
    expect(
      resolveWorkbenchViewportTransition({
        intent: {
          canvasSize: { height: 640, width: 960 },
          type: 'adaptive-focus'
        },
        reducedMotion: true
      })
    ).toEqual({ duration: 0 })
  })

  it('uses smooth spatial travel until an extreme target would over-zoom the canvas', () => {
    const sharedInput = {
      currentViewport: { x: 0, y: 0, zoom: 1 },
      intent: {
        canvasSize: { height: 640, width: 960 },
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

    expect(nearby).toMatchObject({ duration: 220, interpolate: 'smooth' })
    expect(distant.duration).toBeGreaterThan(nearby.duration)
    expect(distant.duration).toBeLessThanOrEqual(300)
    expect(distant.interpolate).toBe('smooth')
    expect(extremelyDistant).toMatchObject({ duration: 300, interpolate: 'linear' })
  })

  it('accounts for zoom change independently from screen-space travel', () => {
    const sharedInput = {
      currentViewport: { x: 0, y: 0, zoom: 1 },
      intent: {
        canvasSize: { height: 640, width: 960 },
        type: 'adaptive-focus' as const
      },
      reducedMotion: false
    }
    const translationOnly = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetCenter: { x: 880, y: 620 },
      targetZoom: 1
    })
    const translationAndZoom = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetCenter: { x: 1_760, y: 1_240 },
      targetZoom: 0.5
    })

    expect(translationAndZoom.duration).toBeGreaterThan(translationOnly.duration)
    expect(translationAndZoom.interpolate).toBe('smooth')
  })

  it('uses a stable fallback before the canvas has reported a positive size', () => {
    expect(
      resolveWorkbenchViewportTransition({
        currentViewport: { x: 0, y: 0, zoom: 1 },
        intent: {
          canvasSize: { height: 0, width: 0 },
          type: 'adaptive-focus'
        },
        reducedMotion: false,
        targetCenter: { x: 480, y: 320 },
        targetZoom: 1
      })
    ).toMatchObject({ duration: 220, interpolate: 'smooth' })
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

    expect(setCenter).toHaveBeenCalledWith(120, 80, {
      duration: 220,
      ease: expect.any(Function),
      interpolate: 'smooth',
      zoom: 0.9
    })
    expect(setViewport).toHaveBeenCalledWith({ x: 10, y: 20, zoom: 0.8 }, { duration: 0 })
    expect(fitView).toHaveBeenCalledWith({
      duration: 220,
      ease: expect.any(Function),
      interpolate: 'smooth',
      maxZoom: 1,
      nodes: [node],
      padding: 0.24
    })
    expect(fitBounds).toHaveBeenCalledWith(
      { height: 300, width: 400, x: 50, y: 60 },
      {
        duration: 220,
        ease: expect.any(Function),
        interpolate: 'smooth',
        padding: 0.24
      }
    )
    expect(zoomIn).toHaveBeenCalledWith({
      duration: 180,
      ease: expect.any(Function),
      interpolate: 'smooth'
    })
    expect(zoomOut).toHaveBeenCalledWith({
      duration: 180,
      ease: expect.any(Function),
      interpolate: 'smooth'
    })
  })
})
