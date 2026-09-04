import { getViewportForBounds, type Edge, type ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import {
  resolveWorkbenchViewportCommandTarget,
  resolveWorkbenchViewportTransition
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

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

  it('keeps anchored zoom response independent from the anchor world position', () => {
    const canvasSize = { height: 640, width: 960 }
    const intent = { canvasSize, type: 'adaptive-focus' as const }
    const resolveAnchoredResponse = (center: { readonly x: number; readonly y: number }) =>
      resolveWorkbenchViewportTransition({
        currentViewport: viewportCenteredOn(center, 0.35, canvasSize),
        intent,
        reducedMotion: false,
        targetViewport: viewportCenteredOn(center, 0.9, canvasSize)
      }).response!

    expect(resolveAnchoredResponse({ x: 0, y: 0 })).toBeCloseTo(
      resolveAnchoredResponse({ x: 3_000, y: 2_000 }),
      12
    )
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
      maxZoom: 1,
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
      1,
      0.24
    )
    expect(center).toEqual({ x: 372, y: 248, zoom: 0.9 })
    expect(viewport).toEqual({ x: 10, y: 20, zoom: 0.8 })
    expect(fitView).toEqual(fittedView)
    expect(fitBounds).toEqual(fittedBounds)
    expect(zoomIn).toEqual({ x: -144, y: -96, zoom: 1.3 })
    expect(zoomOut).toEqual({ x: 144, y: 96, zoom: 0.7 })
  })

  it.each([
    { type: 'zoom-out', zoom: 0.4, expectedZoom: 0.35 },
    { type: 'zoom-out', zoom: 0.35, expectedZoom: 0.35 },
    { type: 'zoom-out', zoom: 1.33, expectedZoom: 1.03 },
    { type: 'zoom-in', zoom: 1.45, expectedZoom: 1.6 },
    { type: 'zoom-in', zoom: 1.6, expectedZoom: 1.6 },
    { type: 'zoom-in', zoom: 0.35, expectedZoom: 0.65 },
    { type: 'zoom-in', zoom: 1.07, expectedZoom: 1.37 }
  ] as const)(
    '$type from $zoom changes zoom by 30 percentage points within the canvas limits',
    ({ type, zoom, expectedZoom }) => {
      const center = { x: 1_250, y: -850 }
      const canvasSize = { height: 640, width: 960 }
      const currentViewport = viewportCenteredOn(center, zoom, canvasSize)
      const instance = {
        getViewport: () => currentViewport
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>

      const target = resolveWorkbenchViewportCommandTarget(instance, {
        intent: { type: 'quick' },
        type
      })

      expect(target.zoom).toBeCloseTo(expectedZoom, 12)
      expect((canvasSize.width / 2 - target.x) / target.zoom).toBeCloseTo(center.x, 12)
      expect((canvasSize.height / 2 - target.y) / target.zoom).toBeCloseTo(center.y, 12)
    }
  )
})

function viewportCenteredOn(
  center: { readonly x: number; readonly y: number },
  zoom: number,
  canvasSize: { readonly height: number; readonly width: number }
) {
  return {
    x: canvasSize.width / 2 - center.x * zoom,
    y: canvasSize.height / 2 - center.y * zoom,
    zoom
  }
}
