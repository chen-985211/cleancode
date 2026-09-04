import { resolveTerminalRasterScale } from '../../../../src/contexts/run/presentation/terminal-surface/terminalZoomRasterPolicy'

describe('terminal zoom raster policy', () => {
  it.each([
    [0.35, 1],
    [0.5, 1],
    [0.77, 1],
    [1, 1],
    [1.01, 1.25],
    [1.24, 1.25],
    [1.25, 1.25],
    [1.26, 1.5],
    [1.49, 1.5],
    [1.5, 1.5],
    [1.51, 1.6],
    [1.6, 1.6]
  ])('covers zoom %s with a stable raster tier %s', (canvasZoom, expectedScale) => {
    expect(resolveTerminalRasterScale({ canvasZoom, currentScale: 1, maximumScale: 1.6 })).toBe(
      expectedScale
    )
  })

  it.each([
    [1, 1.25, 1.25],
    [0.96, 1.25, 1.25],
    [0.94, 1.25, 1],
    [1.24, 1.5, 1.5],
    [1.19, 1.5, 1.25],
    [1.49, 1.6, 1.6],
    [1.44, 1.6, 1.5]
  ])(
    'avoids a downgrade near a tier boundary at zoom %s',
    (canvasZoom, currentScale, expectedScale) => {
      expect(resolveTerminalRasterScale({ canvasZoom, currentScale, maximumScale: 1.6 })).toBe(
        expectedScale
      )
    }
  )

  it('uses the supplied canvas limit for the highest tier', () => {
    expect(
      resolveTerminalRasterScale({ canvasZoom: 1.4, currentScale: 1, maximumScale: 1.4 })
    ).toBe(1.4)
    expect(
      resolveTerminalRasterScale({ canvasZoom: 1.39, currentScale: 1, maximumScale: 1.4 })
    ).toBe(1.4)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'falls back safely for invalid zoom %s',
    (canvasZoom) => {
      expect(resolveTerminalRasterScale({ canvasZoom })).toBe(1)
    }
  )

  it('bounds unsupported zooms without an unbounded backing allocation', () => {
    expect(resolveTerminalRasterScale({ canvasZoom: 3 })).toBe(1.75)
    expect(resolveTerminalRasterScale({ canvasZoom: 0.01 })).toBe(1)
  })
})
