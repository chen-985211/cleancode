import type { Viewport } from '@xyflow/react'

import { minimumCanvasZoom } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

interface CanvasSize {
  readonly height: number
  readonly width: number
}

export interface WorkbenchViewportFlight {
  readonly canvasSize: CanvasSize
  readonly zoomStops: number
}

const flightThresholdInViewports = 0.35
const flightZoomStopsPerViewport = 0.28
const maximumFlightZoomStops = 0.75

export function createWorkbenchViewportFlight(
  currentViewport: Viewport,
  targetViewport: Viewport,
  canvasSize: CanvasSize
): WorkbenchViewportFlight | null {
  if (canvasSize.width <= 0 || canvasSize.height <= 0) {
    return null
  }

  const viewportDiagonal = Math.hypot(canvasSize.width, canvasSize.height)
  const travelInViewports =
    Math.hypot(targetViewport.x - currentViewport.x, targetViewport.y - currentViewport.y) /
    viewportDiagonal
  const desiredZoomStops = Math.min(
    maximumFlightZoomStops,
    Math.max(0, travelInViewports - flightThresholdInViewports) * flightZoomStopsPerViewport
  )
  const availableZoomStops = Math.max(
    0,
    Math.log2(Math.min(currentViewport.zoom, targetViewport.zoom) / minimumCanvasZoom)
  )
  const zoomStops = Math.min(desiredZoomStops, availableZoomStops)

  return zoomStops > 0 ? { canvasSize, zoomStops } : null
}

export function resolveWorkbenchViewportFlightPresentation(
  baseViewport: Viewport,
  progress: number,
  flight: WorkbenchViewportFlight | null
): Viewport {
  if (!flight) {
    return baseViewport
  }

  const boundedProgress = Math.min(1, Math.max(0, progress))
  const flightEnvelope = Math.sin(Math.PI * boundedProgress) ** 2
  const zoom = Math.max(
    minimumCanvasZoom,
    baseViewport.zoom * 2 ** (-flight.zoomStops * flightEnvelope)
  )
  const screenCenterX = flight.canvasSize.width / 2
  const screenCenterY = flight.canvasSize.height / 2
  const worldCenterX = (screenCenterX - baseViewport.x) / baseViewport.zoom
  const worldCenterY = (screenCenterY - baseViewport.y) / baseViewport.zoom

  return {
    x: screenCenterX - worldCenterX * zoom,
    y: screenCenterY - worldCenterY * zoom,
    zoom
  }
}
