import { resolveWorkbenchNodeFocusZoom } from '../../../src/presentation/app-shell/workbenchNodeFocusViewport'

describe('workbench node focus viewport', () => {
  it('restores a readable minimap zoom when a compact target still fits safely', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.5,
        intent: 'minimap',
        nodeSize: { width: 400, height: 300 }
      })
    ).toBe(0.9)
  })

  it('never zooms in while navigating with a shortcut', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.5,
        intent: 'shortcut',
        nodeSize: { width: 400, height: 300 }
      })
    ).toBe(0.5)
  })

  it('ignores small zoom corrections to prevent scale breathing', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.9,
        intent: 'shortcut',
        nodeSize: { width: 720 / 0.85, height: 300 }
      })
    ).toBe(0.9)
  })

  it('respects the canvas minimum zoom for an extreme target', () => {
    expect(
      resolveWorkbenchNodeFocusZoom({
        canvasSize: { width: 1_000, height: 800 },
        currentZoom: 0.9,
        intent: 'minimap',
        nodeSize: { width: 10_000, height: 10_000 }
      })
    ).toBe(0.35)
  })
})
