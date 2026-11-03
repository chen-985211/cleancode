interface RasterDisplayProjection {
  readonly backingWidth: number
  readonly backingHeight: number
  readonly displayWidth: number
  readonly displayHeight: number
  readonly displayLeft: number
  readonly displayTop: number
  readonly devicePixelRatio: number
}

export const terminalRasterPixelTolerance = 2

export function expectTerminalRasterMatchesDisplay(projection: RasterDisplayProjection): void {
  expect(projection.backingWidth).toBe(
    Math.round(projection.displayWidth * projection.devicePixelRatio)
  )
  expect(projection.backingHeight).toBe(
    Math.round(projection.displayHeight * projection.devicePixelRatio)
  )
}

export function expectTerminalRasterOriginAligned(projection: RasterDisplayProjection): void {
  for (const origin of [projection.displayLeft, projection.displayTop]) {
    expect(origin * projection.devicePixelRatio).toBeCloseTo(
      Math.round(origin * projection.devicePixelRatio),
      2
    )
  }
}

export function expectTerminalGlyphPixelsPreserved(
  maximumDifference: number,
  context?: string
): void {
  // Native Windows glyph rendering can vary by two 8-bit intensity levels.
  // A shifted or resampled glyph exceeds this same bound in all raster tests.
  expect(maximumDifference, context).toBeLessThanOrEqual(terminalRasterPixelTolerance)
}
