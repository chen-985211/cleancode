import {
  resolveWorkbenchViewportCamera,
  resolveWorkbenchViewportCameraVelocity,
  resolveWorkbenchViewportFromCamera,
  resolveWorkbenchViewportSpatialTravel
} from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportCamera'

describe('workbench viewport camera', () => {
  const canvasSize = { height: 640, width: 960 }

  it('round-trips a viewport through world center and logarithmic zoom', () => {
    const viewport = { x: -1_720, y: -670, zoom: 1.1 }
    const camera = resolveWorkbenchViewportCamera(viewport, canvasSize)

    expect(camera.centerX).toBeCloseTo(2_000, 12)
    expect(camera.centerY).toBeCloseTo(900, 12)
    expect(camera.zoomStops).toBeCloseTo(Math.log2(1.1), 12)
    expect(resolveWorkbenchViewportFromCamera(camera, canvasSize)).toEqual(viewport)
  })

  it('converts viewport velocity without changing the resulting camera derivative', () => {
    const viewport = { x: -1_320, y: -490, zoom: 0.9 }
    const viewportVelocity = { x: -180, y: 75, zoom: 0.36 }
    const camera = resolveWorkbenchViewportCamera(viewport, canvasSize)
    const velocity = resolveWorkbenchViewportCameraVelocity(viewport, viewportVelocity, canvasSize)
    const deltaSeconds = 0.000_01
    const projected = resolveWorkbenchViewportFromCamera(
      {
        centerX: camera.centerX + velocity.centerX * deltaSeconds,
        centerY: camera.centerY + velocity.centerY * deltaSeconds,
        zoomStops: camera.zoomStops + velocity.zoomStops * deltaSeconds
      },
      canvasSize
    )

    expect((projected.x - viewport.x) / deltaSeconds).toBeCloseTo(viewportVelocity.x, 2)
    expect((projected.y - viewport.y) / deltaSeconds).toBeCloseTo(viewportVelocity.y, 2)
    expect((projected.zoom - viewport.zoom) / deltaSeconds).toBeCloseTo(viewportVelocity.zoom, 4)
  })

  it('reports no spatial travel for zoom around one world-space anchor', () => {
    const center = { x: 3_000, y: 2_000 }
    const currentViewport = viewportCenteredOn(center, 0.6)
    const targetViewport = viewportCenteredOn(center, 0.9)

    expect(resolveWorkbenchViewportSpatialTravel(currentViewport, targetViewport, canvasSize)).toBe(
      0
    )
  })
})

function viewportCenteredOn(center: { readonly x: number; readonly y: number }, zoom: number) {
  return {
    x: 480 - center.x * zoom,
    y: 320 - center.y * zoom,
    zoom
  }
}
