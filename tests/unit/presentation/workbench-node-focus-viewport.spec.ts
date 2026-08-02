import { resolveWorkbenchNodeFocusZoom } from '../../../src/presentation/app-shell/workbenchNodeFocusViewport'

describe('workbench node focus viewport', () => {
  it('restores a readable zoom when a compact target still fits safely', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.5,
        nodeSize: { width: 400, height: 300 }
      })
    ).toBe(0.9)
  })

  it('keeps the current zoom when a target is already readable and fits safely', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 1.1,
        nodeSize: { width: 400, height: 300 }
      })
    ).toBe(1.1)
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
