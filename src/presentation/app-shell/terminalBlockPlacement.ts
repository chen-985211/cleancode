import {
  defaultTerminalBlockSize,
  type BlockPositionSnapshot,
  type TerminalBlockSnapshot,
  type TerminalBlockSizeSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

const terminalPlacementOrigin: BlockPositionSnapshot = {
  x: 180,
  y: 270
}
const terminalPlacementGap = 64
const terminalPlacementColumns = 3

interface TerminalBlockRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export function resolveNewTerminalBlockPosition(
  existingBlocks: readonly TerminalBlockSnapshot[]
): BlockPositionSnapshot {
  const placementOrigin = resolvePlacementOrigin(existingBlocks)
  const candidateCount = Math.max((existingBlocks.length + 1) * terminalPlacementColumns, 24)

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex += 1) {
    const position = createCandidatePosition(candidateIndex, placementOrigin)

    if (!positionOverlapsExistingBlocks(position, defaultTerminalBlockSize, existingBlocks)) {
      return position
    }
  }

  return createPositionAfterCurrentGraphBounds(existingBlocks)
}

function createCandidatePosition(
  candidateIndex: number,
  placementOrigin: BlockPositionSnapshot
): BlockPositionSnapshot {
  const column = candidateIndex % terminalPlacementColumns
  const row = Math.floor(candidateIndex / terminalPlacementColumns)

  return {
    x: placementOrigin.x + column * (defaultTerminalBlockSize.width + terminalPlacementGap),
    y: placementOrigin.y + row * (defaultTerminalBlockSize.height + terminalPlacementGap)
  }
}

function positionOverlapsExistingBlocks(
  position: BlockPositionSnapshot,
  size: TerminalBlockSizeSnapshot,
  existingBlocks: readonly TerminalBlockSnapshot[]
): boolean {
  const candidateRect = createRect(position, size)

  return existingBlocks.some((block) =>
    rectsOverlap(candidateRect, createRect(block.position, block.size))
  )
}

function createPositionAfterCurrentGraphBounds(
  existingBlocks: readonly TerminalBlockSnapshot[]
): BlockPositionSnapshot {
  if (existingBlocks.length === 0) {
    return terminalPlacementOrigin
  }

  const graphBounds = existingBlocks
    .map((block) => createRect(block.position, block.size))
    .reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    }))

  return {
    x: graphBounds.right + terminalPlacementGap,
    y: graphBounds.top
  }
}

function resolvePlacementOrigin(
  existingBlocks: readonly TerminalBlockSnapshot[]
): BlockPositionSnapshot {
  if (existingBlocks.length === 0) {
    return terminalPlacementOrigin
  }

  return existingBlocks
    .map((block) => block.position)
    .reduce((origin, position) => ({
      x: Math.min(origin.x, position.x),
      y: Math.min(origin.y, position.y)
    }))
}

function createRect(
  position: BlockPositionSnapshot,
  size: TerminalBlockSizeSnapshot
): TerminalBlockRect {
  return {
    left: position.x,
    top: position.y,
    right: position.x + size.width,
    bottom: position.y + size.height
  }
}

function rectsOverlap(leftRect: TerminalBlockRect, rightRect: TerminalBlockRect): boolean {
  return (
    leftRect.left < rightRect.right + terminalPlacementGap &&
    leftRect.right + terminalPlacementGap > rightRect.left &&
    leftRect.top < rightRect.bottom + terminalPlacementGap &&
    leftRect.bottom + terminalPlacementGap > rightRect.top
  )
}
