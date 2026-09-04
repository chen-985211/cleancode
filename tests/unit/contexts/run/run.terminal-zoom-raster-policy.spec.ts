import { resolveTerminalRasterScale } from '../../../../src/contexts/run/presentation/terminal-surface/terminalZoomRasterPolicy'

describe('terminal zoom raster policy', () => {
  it.each([
    [0.35, 1],
    [0.5, 1],
    [0.77, 1],
    [0.99, 1],
    [1, 1],
    [1.01, 1.15],
    [1.1, 1.15],
    [1.15, 1.15],
    [1.150001, 1.3],
    [1.2, 1.3],
    [1.3, 1.3],
    [1.300001, 1.45],
    [1.33, 1.45],
    [1.45, 1.45],
    [1.450001, 1.6],
    [1.5, 1.6],
    [1.6, 1.6]
  ])('covers zoom %s with a stable raster tier %s', (canvasZoom, expectedScale) => {
    expect(resolveTerminalRasterScale({ canvasZoom, currentScale: 1, maximumScale: 1.6 })).toBe(
      expectedScale
    )
  })

  it.each([
    [1, 1.15, 1.15],
    [0.96, 1.15, 1.15],
    [0.95, 1.15, 1],
    [0.94, 1.15, 1],
    [1.14, 1.3, 1.3],
    [1.100001, 1.3, 1.3],
    [1.1, 1.3, 1.15],
    [1.09, 1.3, 1.15],
    [1.29, 1.45, 1.45],
    [1.250001, 1.45, 1.45],
    [1.25, 1.45, 1.3],
    [1.24, 1.45, 1.3],
    [1.44, 1.6, 1.6],
    [1.400001, 1.6, 1.6],
    [1.4, 1.6, 1.45],
    [1.39, 1.6, 1.45]
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
    expect(resolveTerminalRasterScale({ canvasZoom: 3 })).toBe(1.6)
    expect(resolveTerminalRasterScale({ canvasZoom: 0.01 })).toBe(1)
  })
})
