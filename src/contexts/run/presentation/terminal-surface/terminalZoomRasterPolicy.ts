// Cap the last tier at the canvas limit supplied by the presentation shell.
export const terminalRasterScaleLevels = [1, 1.15, 1.3, 1.45, 1.6] as const

export type TerminalRasterScale = number

const terminalRasterDowngradeHysteresis = 0.05

export function resolveTerminalRasterScale({
  canvasZoom,
  currentScale = 1,
  preferredScale,
  maximumScale = terminalRasterScaleLevels.at(-1)!
}: {
  readonly canvasZoom: number
  readonly currentScale?: number
  readonly preferredScale?: number
  readonly maximumScale?: number
}): TerminalRasterScale {
  const ceiling = Number.isFinite(maximumScale)
    ? Math.min(terminalRasterScaleLevels.at(-1)!, Math.max(1, maximumScale))
    : terminalRasterScaleLevels.at(-1)!
  if (preferredScale !== undefined && Number.isFinite(preferredScale) && preferredScale > 0) {
    return Math.min(ceiling, Math.max(0.25, preferredScale))
  }
  if (!Number.isFinite(canvasZoom) || canvasZoom <= 0) return 1
  const levels = [...terminalRasterScaleLevels.filter((scale) => scale < ceiling), ceiling]
  const desiredScale = levels.find((scale) => scale >= canvasZoom) ?? ceiling
  const currentIndex = levels.indexOf(currentScale)
  const lowerBoundary = levels[currentIndex - 1]
  if (
    desiredScale < currentScale &&
    lowerBoundary !== undefined &&
    // Decimal tiers such as 1.15 must downgrade at exactly 1.10 as well.
    canvasZoom > lowerBoundary - terminalRasterDowngradeHysteresis + Number.EPSILON
  ) {
    return currentScale
  }
  return desiredScale
}
