// These are budget fallback levels, not the resolution of a settled visible terminal.
export const terminalRasterScaleLevels = [1, 1.25, 1.5, 1.75] as const

export type TerminalRasterScale = number

export function resolveTerminalRasterScale({
  canvasZoom
}: {
  readonly canvasZoom: number
}): TerminalRasterScale {
  if (!Number.isFinite(canvasZoom) || canvasZoom <= 0) return 1

  return Math.min(terminalRasterScaleLevels.at(-1)!, Math.max(0.25, canvasZoom))
}
