import { resolveMinimapFocusDuration } from '../../../src/presentation/app-shell/minimapFocusTransition'

describe('minimap focus transition', () => {
  it('gives distant minimap targets more travel time without making the transition unbounded', () => {
    const currentViewport = { x: 0, y: 0, zoom: 1 }
    const canvasSize = { width: 960, height: 640 }

    const nearbyDuration = resolveMinimapFocusDuration({
      currentViewport,
      canvasSize,
      targetCenter: { x: 480, y: 320 },
      targetZoom: 1
    })
    const distantDuration = resolveMinimapFocusDuration({
      currentViewport,
      canvasSize,
      targetCenter: { x: 1_480, y: 1_070 },
      targetZoom: 1
    })
    const extremelyDistantDuration = resolveMinimapFocusDuration({
      currentViewport,
      canvasSize,
      targetCenter: { x: 40_480, y: 30_320 },
      targetZoom: 1
    })

    expect(nearbyDuration).toBe(180)
    expect(distantDuration).toBeGreaterThan(nearbyDuration)
    expect(distantDuration).toBeLessThanOrEqual(300)
    expect(extremelyDistantDuration).toBe(300)
  })

  it('measures travel from the current canvas center instead of the graph origin', () => {
    expect(
      resolveMinimapFocusDuration({
        currentViewport: { x: -3_520, y: -2_680, zoom: 1 },
        canvasSize: { width: 960, height: 640 },
        targetCenter: { x: 4_000, y: 3_000 },
        targetZoom: 1
      })
    ).toBe(180)
  })
})
