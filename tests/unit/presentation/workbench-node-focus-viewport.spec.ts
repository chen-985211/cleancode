import { resolveWorkbenchNodeFocusZoom } from '../../../src/presentation/app-shell/workbench/viewport/workbenchNodeFocusViewport'

describe('workbench node focus viewport', () => {
  it.each([0.35, 0.5, 0.9])(
    'restores 100% from %s when a compact target still fits safely',
    (currentZoom) => {
      expect(
        resolveWorkbenchNodeFocusZoom({
          canvasSize: { width: 1_000, height: 800 },
          currentZoom,
          nodeSize: { width: 400, height: 300 }
        })
      ).toBe(1)
    }
  )

  it('keeps the current zoom when a target is already readable and fits safely', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 1.1,
        nodeSize: { width: 400, height: 300 }
      })
    ).toBe(1.1)
  })

  it('fits a wide node inside a narrow canvas instead of forcing the readable zoom', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 728, height: 681 },
        currentZoom: 0.35,
        nodeSize: { width: 720, height: 460 }
      })
    ).toBeCloseTo(0.728, 10)
  })

  it('ignores small zoom corrections to prevent scale breathing', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.9,
        nodeSize: { width: 720 / 0.85, height: 300 }
      })
    ).toBe(0.9)
  })

  it('respects the canvas minimum zoom for an extreme target', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.9,
        nodeSize: { width: 10_000, height: 10_000 }
      })
    ).toBe(0.35)
  })
})
