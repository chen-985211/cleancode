import type { BlockPositionSnapshot } from '../aggregates/BlockGraphTypes'

export const terminalLayoutGap = 64

const targetLayoutAspectRatio = 2.4

export interface TerminalBlockLayout {
  readonly blockId: string
  readonly position: BlockPositionSnapshot
}

export interface TerminalExecutionUnitLayout {
  readonly blockLayouts: readonly TerminalBlockLayout[]
  readonly height: number
  readonly width: number
}

interface PackedTerminalExecutionUnits {
  readonly blockLayouts: readonly TerminalBlockLayout[]
  readonly height: number
  readonly rowWidthLimit: number
  readonly width: number
}

export function selectBalancedTerminalExecutionUnitPacking(
  units: readonly TerminalExecutionUnitLayout[]
): PackedTerminalExecutionUnits {
  const candidates = resolveCandidateRowWidthLimits(units).map((rowWidthLimit) =>
    packTerminalExecutionUnits(units, rowWidthLimit)
  )

  return candidates.sort(
    (left, right) =>
      scoreTerminalExecutionUnitPacking(left) - scoreTerminalExecutionUnitPacking(right) ||
      left.width * left.height - right.width * right.height ||
      left.rowWidthLimit - right.rowWidthLimit
  )[0]!
}

function resolveCandidateRowWidthLimits(units: readonly TerminalExecutionUnitLayout[]): number[] {
  const rowWidthLimits = new Set<number>()

  for (let startIndex = 0; startIndex < units.length; startIndex += 1) {
    let rowWidth = 0

    for (let endIndex = startIndex; endIndex < units.length; endIndex += 1) {
      rowWidth += units[endIndex]!.width + (endIndex === startIndex ? 0 : terminalLayoutGap)
      rowWidthLimits.add(rowWidth)
    }
  }

  return [...rowWidthLimits].sort((left, right) => left - right)
}

function packTerminalExecutionUnits(
  units: readonly TerminalExecutionUnitLayout[],
  rowWidthLimit: number
): PackedTerminalExecutionUnits {
  const rows: TerminalExecutionUnitLayout[][] = []

  for (const unit of units) {
    const currentRow = rows.at(-1)
    const currentRowWidth = currentRow
      ? sumWithGap(
          currentRow.map((candidate) => candidate.width),
          terminalLayoutGap
        )
      : 0

    if (
      !currentRow ||
      (currentRow.length > 0 && currentRowWidth + terminalLayoutGap + unit.width > rowWidthLimit)
    ) {
      rows.push([unit])
      continue
    }

    currentRow.push(unit)
  }
  const rowWidths = rows.map((row) =>
    sumWithGap(
      row.map((unit) => unit.width),
      terminalLayoutGap
    )
  )
  const rowHeights = rows.map((row) => Math.max(...row.map((unit) => unit.height)))
  const width = Math.max(...rowWidths)
  const blockLayouts: TerminalBlockLayout[] = []
  let rowY = 0

  for (const [rowIndex, row] of rows.entries()) {
    let unitX = Math.round((width - rowWidths[rowIndex]!) / 2)

    for (const unit of row) {
      const unitY = Math.round((rowHeights[rowIndex]! - unit.height) / 2)
      blockLayouts.push(
        ...unit.blockLayouts.map((layout) => ({
          ...layout,
          position: {
            x: layout.position.x + unitX,
            y: layout.position.y + rowY + unitY
          }
        }))
      )
      unitX += unit.width + terminalLayoutGap
    }
    rowY += rowHeights[rowIndex]! + terminalLayoutGap
  }

  return {
    blockLayouts,
    height: sumWithGap(rowHeights, terminalLayoutGap),
    rowWidthLimit,
    width
  }
}

function scoreTerminalExecutionUnitPacking(packing: PackedTerminalExecutionUnits): number {
  return Math.abs(Math.log(packing.width / packing.height / targetLayoutAspectRatio))
}

export function sumWithGap(values: readonly number[], gap: number): number {
  return values.reduce((sum, value) => sum + value, 0) + Math.max(0, values.length - 1) * gap
}
