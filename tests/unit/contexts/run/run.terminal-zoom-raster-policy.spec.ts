import { resolveTerminalRasterScale } from '../../../../src/contexts/run/presentation/terminal-surface/terminalZoomRasterPolicy'

describe('terminal zoom raster policy', () => {
  it.each([0.35, 0.5, 0.67, 0.77, 1, 1.01, 1.25, 1.26, 1.49, 1.5, 1.6])(
    'matches settled zoom %s without another scale conversion',
    (canvasZoom) => {
      expect(resolveTerminalRasterScale({ canvasZoom })).toBe(canvasZoom)
    }
  )

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'falls back safely for invalid zoom %s',
    (canvasZoom) => {
      expect(resolveTerminalRasterScale({ canvasZoom })).toBe(1)
    }
  )

  it('bounds unsupported zooms without an unbounded backing allocation', () => {
    expect(resolveTerminalRasterScale({ canvasZoom: 3 })).toBe(1.75)
    expect(resolveTerminalRasterScale({ canvasZoom: 0.01 })).toBe(0.25)
  })
})
