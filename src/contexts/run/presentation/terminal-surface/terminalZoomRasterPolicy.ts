// Cap the last tier at the canvas limit supplied by the presentation shell.
export const terminalRasterScaleLevels = [1, 1.25, 1.5, 1.75] as const

export type TerminalRasterScale = number

const terminalRasterDowngradeHysteresis = 0.05

export function resolveTerminalRasterScale({
  canvasZoom,
  currentScale = 1,
  maximumScale = terminalRasterScaleLevels.at(-1)!
}: {
  readonly canvasZoom: number
  readonly currentScale?: number
  readonly maximumScale?: number
}): TerminalRasterScale {
  if (!Number.isFinite(canvasZoom) || canvasZoom <= 0) return 1

  const ceiling = Number.isFinite(maximumScale)
    ? Math.min(terminalRasterScaleLevels.at(-1)!, Math.max(1, maximumScale))
    : terminalRasterScaleLevels.at(-1)!
  const levels = [...terminalRasterScaleLevels.filter((scale) => scale < ceiling), ceiling]
  const desiredScale = levels.find((scale) => scale >= canvasZoom) ?? ceiling
  const currentIndex = levels.indexOf(currentScale)
  const lowerBoundary = levels[currentIndex - 1]
  if (
    desiredScale < currentScale &&
    lowerBoundary !== undefined &&
    canvasZoom > lowerBoundary - terminalRasterDowngradeHysteresis
  ) {
    return currentScale
  }
  return desiredScale
}
