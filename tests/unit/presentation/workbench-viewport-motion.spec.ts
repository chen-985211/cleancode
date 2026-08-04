import { getViewportForBounds, type Edge, type ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import {
  resolveWorkbenchViewportCommandTarget,
  resolveWorkbenchViewportTransition
} from '../../../src/presentation/app-shell/workbenchViewportMotion'

describe('workbench viewport motion', () => {
  it.each([
    {
      commandType: 'zoom-in' as const,
      expectedResponse: 0.3,
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'fit-view' as const,
      expectedResponse: 0.3,
      intent: { type: 'quick' as const }
    },
    {
      commandType: 'center' as const,
      expectedResponse: 0.34,
      intent: { type: 'spatial' as const }
    },
    {
      commandType: 'set-viewport' as const,
      expectedResponse: 0.34,
      intent: { type: 'spatial' as const }
    }
  ])('maps $intent.type $commandType motion to one shared rhythm', (input) => {
    const transition = resolveWorkbenchViewportTransition({
      intent: input.intent,
      reducedMotion: false
    })

    expect(transition).toMatchObject({
      dampingRatio: 1,
      response: input.expectedResponse
    })
  })

  it('keeps instant and reduced-motion transitions free from spatial interpolation', () => {
    expect(
      resolveWorkbenchViewportTransition({
        intent: { type: 'instant' },
        reducedMotion: false
      })
    ).toEqual({})
    expect(
      resolveWorkbenchViewportTransition({
        intent: {
          canvasSize: { height: 640, width: 960 },
          type: 'adaptive-focus'
        },
        reducedMotion: true
      })
    ).toEqual({})
  })

  it('bounds the spring response for increasingly distant targets', () => {
    const sharedInput = {
      currentViewport: { x: 0, y: 0, zoom: 1 },
      intent: {
        canvasSize: { height: 640, width: 960 },
        type: 'adaptive-focus' as const
      },
      reducedMotion: false
    }

    const nearby = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetViewport: { x: 0, y: 0, zoom: 1 }
    })
    const distant = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetViewport: { x: -1_000, y: -750, zoom: 1 }
    })
    const extremelyDistant = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetViewport: { x: -40_000, y: -30_000, zoom: 1 }
    })

    expect(nearby).toMatchObject({ dampingRatio: 1, response: 0.34 })
    expect(distant.response).toBeGreaterThan(nearby.response!)
    expect(distant.response).toBeLessThanOrEqual(0.42)
    expect(extremelyDistant).toMatchObject({ dampingRatio: 1, response: 0.42 })
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
      targetViewport: { x: -400, y: -300, zoom: 1 }
    })
    const translationAndZoom = resolveWorkbenchViewportTransition({
      ...sharedInput,
      targetViewport: { x: -400, y: -300, zoom: 0.5 }
    })

    expect(translationAndZoom.response).toBeGreaterThan(translationOnly.response!)
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
        targetViewport: { x: 0, y: 0, zoom: 1 }
      })
    ).toMatchObject({ dampingRatio: 1, response: 0.34 })
  })

  it('resolves every viewport command to an explicit spring target', () => {
    const instance = {
      getNode: () => undefined,
      getNodes: () => [],
      getNodesBounds: () => ({ height: 300, width: 400, x: 50, y: 60 }),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 })
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    const node = {
      data: {},
      id: 'terminal-1',
      position: { x: 50, y: 60 },
      type: 'terminal'
    } as WorkbenchFlowNode
    const center = resolveWorkbenchViewportCommandTarget(instance, {
      center: { x: 120, y: 80 },
      intent: { type: 'spatial' },
      type: 'center',
      zoom: 0.9
    })
    const viewport = resolveWorkbenchViewportCommandTarget(instance, {
      intent: { type: 'instant' },
      type: 'set-viewport',
      viewport: { x: 10, y: 20, zoom: 0.8 }
    })
    const fitView = resolveWorkbenchViewportCommandTarget(instance, {
      intent: { type: 'spatial' },
      maxZoom: 1,
      nodes: [node],
      padding: 0.24,
      type: 'fit-view'
    })
    const fitBounds = resolveWorkbenchViewportCommandTarget(instance, {
      bounds: { height: 300, width: 400, x: 50, y: 60 },
      intent: { type: 'spatial' },
      padding: 0.24,
      type: 'fit-bounds'
    })
    const zoomIn = resolveWorkbenchViewportCommandTarget(instance, {
      intent: { type: 'quick' },
      type: 'zoom-in'
    })
    const zoomOut = resolveWorkbenchViewportCommandTarget(instance, {
      intent: { type: 'quick' },
      type: 'zoom-out'
    })

    const fittedView = getViewportForBounds(
      { height: 300, width: 400, x: 50, y: 60 },
      960,
      640,
      0.35,
      1,
      0.24
    )
    const fittedBounds = getViewportForBounds(
      { height: 300, width: 400, x: 50, y: 60 },
      960,
      640,
      0.35,
      1.6,
      0.24
    )
    expect(center).toEqual({ x: 372, y: 248, zoom: 0.9 })
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 0.8 })
    expect(fitView).toEqual(fittedView)
    expect(fitBounds).toEqual(fittedBounds)
    expect(zoomIn).toEqual({ x: -96, y: -64, zoom: 1.2 })
    expect(zoomOut.x).toBe(80)
    expect(zoomOut.y).toBeCloseTo(160 / 3)
    expect(zoomOut.zoom).toBeCloseTo(5 / 6)
  })
})
