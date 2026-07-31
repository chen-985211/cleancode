import type { TerminalDimensions } from './types'

interface TerminalStartupGridReconciliationOptions {
  readonly initialDimensions: TerminalDimensions | null
  readonly canSettle: () => boolean
  readonly measure: () => TerminalDimensions | null
  readonly onDimensionsChange: (dimensions: TerminalDimensions) => void
  readonly onSettledDimensions?: (dimensions: TerminalDimensions) => void
  readonly requestFrame: (callback: () => void) => number
  readonly cancelFrame: (handle: number) => void
}

export interface TerminalStartupGridReconciliationHandle {
  cancel(): void
}

const startupGridStableFrames = 8
const startupGridMaximumFrames = 180

export function startTerminalStartupGridReconciliation(
  options: TerminalStartupGridReconciliationOptions
): TerminalStartupGridReconciliationHandle {
  let frame = 0
  let stableFrames = 0
  let lastDimensions = options.initialDimensions
  let pendingFrame: number | null = null
  let cancelled = false

  const reconcile = (): void => {
    pendingFrame = null
    if (cancelled) return

    frame += 1
    const measuredDimensions = options.measure()
    if (!isUsableDimensions(measuredDimensions)) {
      stableFrames = 0
    } else if (!haveSameDimensions(lastDimensions, measuredDimensions)) {
      lastDimensions = measuredDimensions
      stableFrames = 0
      options.onDimensionsChange(measuredDimensions)
    } else if (options.canSettle()) {
      stableFrames += 1
    } else {
      stableFrames = 0
    }

    const settled = stableFrames >= startupGridStableFrames
    if (settled && options.onSettledDimensions && isUsableDimensions(lastDimensions)) {
      options.onSettledDimensions(lastDimensions)
    }

    if (!cancelled && !settled && frame < startupGridMaximumFrames) {
      pendingFrame = options.requestFrame(reconcile)
    }
  }

  pendingFrame = options.requestFrame(reconcile)

  return {
    cancel(): void {
      cancelled = true
      if (pendingFrame === null) return
      options.cancelFrame(pendingFrame)
      pendingFrame = null
    }
  }
}

export function shouldReassertTerminalStartupDimensions(platform: string): boolean {
  return /^Win/iu.test(platform)
}

function isUsableDimensions(
  dimensions: TerminalDimensions | null
): dimensions is TerminalDimensions {
  return dimensions !== null && dimensions.columns > 0 && dimensions.rows > 0
}

function haveSameDimensions(left: TerminalDimensions | null, right: TerminalDimensions): boolean {
  return left?.columns === right.columns && left.rows === right.rows
}
