import { createCanvasStatusbarLensMap } from '../../../src/presentation/app-shell/workbench/canvasStatusbarGlassLens'

describe('canvas statusbar glass lens', () => {
  it.each([
    { width: 320, height: 24 },
    { width: 320, height: 26 },
    { width: 1_200, height: 24 },
    { width: 1_200, height: 26 },
    { width: 2_560, height: 24 },
    { width: 2_560, height: 26 }
  ])('keeps the center undistorted at $width × $height', ({ width, height }) => {
    const map = createCanvasStatusbarLensMap(width, height, 22)
    const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4

    expect(Array.from(map.slice(center, center + 4))).toEqual([128, 128, 128, 255])
  })

  it('refracts opposite edges toward the interior of the glass', () => {
    const width = 320
    const height = 26
    const map = createCanvasStatusbarLensMap(width, height, 22)
    const pixel = (x: number, y: number) =>
      Array.from(map.slice((y * width + x) * 4, (y * width + x + 1) * 4))

    expect(pixel(6, 13)[0]).toBeGreaterThan(128)
    expect(pixel(width - 7, 13)[0]).toBeLessThan(128)
    expect(pixel(160, 5)[1]).toBeGreaterThan(128)
    expect(pixel(160, height - 6)[1]).toBeLessThan(128)
    expect(pixel(4, 4)[0]).toBeGreaterThan(128)
    expect(pixel(4, 4)[1]).toBeGreaterThan(128)
  })

  it('produces a bounded map for a minimally sized surface', () => {
    const map = createCanvasStatusbarLensMap(1, 1, 22)

    expect(map).toHaveLength(4)
    expect(map[3]).toBe(255)
  })
})
