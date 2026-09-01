import { resolveCanvasObjectContextMenuPosition } from '../../../src/presentation/app-shell/workbench/menus/canvasObjectContextMenuPosition'

describe('canvas object context menu position', () => {
  it('opens near the pointer when enough viewport space is available', () => {
    expect(
      resolveCanvasObjectContextMenuPosition({
        menuHeight: 80,
        menuWidth: 160,
        pointerX: 240,
        pointerY: 180,
        viewportHeight: 720,
        viewportWidth: 1080
      })
    ).toEqual({ left: 244, top: 184 })
  })

  it('keeps the complete menu inside every viewport edge', () => {
    expect(
      resolveCanvasObjectContextMenuPosition({
        menuHeight: 80,
        menuWidth: 160,
        pointerX: 1060,
        pointerY: 710,
        viewportHeight: 720,
        viewportWidth: 1080
      })
    ).toEqual({ left: 912, top: 632 })

    expect(
      resolveCanvasObjectContextMenuPosition({
        menuHeight: 80,
        menuWidth: 160,
        pointerX: -24,
        pointerY: -32,
        viewportHeight: 720,
        viewportWidth: 1080
      })
    ).toEqual({ left: 8, top: 8 })
  })
})
