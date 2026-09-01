import type { Viewport } from '@xyflow/react'

export interface WorkbenchCanvasSize {
  readonly height: number
  readonly width: number
}

export interface WorkbenchViewportCamera {
  readonly centerX: number
  readonly centerY: number
  readonly zoomStops: number
}

export interface WorkbenchViewportCameraVelocity {
  readonly centerX: number
  readonly centerY: number
  readonly zoomStops: number
}

export function resolveWorkbenchViewportCamera(
  viewport: Viewport,
  canvasSize: WorkbenchCanvasSize
): WorkbenchViewportCamera {
  assertPositiveZoom(viewport.zoom)

  return {
    centerX: (canvasSize.width / 2 - viewport.x) / viewport.zoom,
    centerY: (canvasSize.height / 2 - viewport.y) / viewport.zoom,
    zoomStops: Math.log2(viewport.zoom)
  }
}

export function resolveWorkbenchViewportFromCamera(
  camera: WorkbenchViewportCamera,
  canvasSize: WorkbenchCanvasSize
): Viewport {
  const zoom = 2 ** camera.zoomStops

  return {
    x: canvasSize.width / 2 - camera.centerX * zoom,
    y: canvasSize.height / 2 - camera.centerY * zoom,
    zoom
  }
}

export function resolveWorkbenchViewportCameraVelocity(
  viewport: Viewport,
  viewportVelocity: Viewport,
  canvasSize: WorkbenchCanvasSize
): WorkbenchViewportCameraVelocity {
  const camera = resolveWorkbenchViewportCamera(viewport, canvasSize)

  return {
    centerX: -(viewportVelocity.x + camera.centerX * viewportVelocity.zoom) / viewport.zoom,
    centerY: -(viewportVelocity.y + camera.centerY * viewportVelocity.zoom) / viewport.zoom,
    zoomStops: viewportVelocity.zoom / (viewport.zoom * Math.LN2)
  }
}

export function resolveWorkbenchViewportVelocityFromCamera(
  camera: WorkbenchViewportCamera,
  velocity: WorkbenchViewportCameraVelocity
): Viewport {
  const zoom = 2 ** camera.zoomStops
  const zoomVelocity = zoom * Math.LN2 * velocity.zoomStops

  return {
    x: -velocity.centerX * zoom - camera.centerX * zoomVelocity,
    y: -velocity.centerY * zoom - camera.centerY * zoomVelocity,
    zoom: zoomVelocity
  }
}

export function resolveWorkbenchViewportSpatialTravel(
  currentViewport: Viewport,
  targetViewport: Viewport,
  canvasSize: WorkbenchCanvasSize
): number {
  const currentCamera = resolveWorkbenchViewportCamera(currentViewport, canvasSize)
  const targetCamera = resolveWorkbenchViewportCamera(targetViewport, canvasSize)
  const representativeZoom = Math.sqrt(currentViewport.zoom * targetViewport.zoom)

  return (
    Math.hypot(
      targetCamera.centerX - currentCamera.centerX,
      targetCamera.centerY - currentCamera.centerY
    ) * representativeZoom
  )
}

function assertPositiveZoom(zoom: number): void {
  if (zoom <= 0) {
    throw new RangeError('Workbench viewport camera zoom must be positive.')
  }
}
