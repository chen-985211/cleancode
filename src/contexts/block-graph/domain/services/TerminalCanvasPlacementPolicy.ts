export interface TerminalCanvasPlacementRegion {
  readonly bottom: number
  readonly left: number
  readonly right: number
  readonly top: number
}

export interface TerminalCanvasPlacementTranslation {
  readonly x: number
  readonly y: number
}

interface PlacementCandidate {
  readonly region: TerminalCanvasPlacementRegion
  readonly score: readonly [number, number, number, number, number, number]
}

export function resolveTerminalCanvasPlacement(
  targetRegion: TerminalCanvasPlacementRegion,
  occupiedRegions: readonly TerminalCanvasPlacementRegion[],
  gap: number
): TerminalCanvasPlacementTranslation {
  if (occupiedRegions.length === 0) {
    return { x: -targetRegion.left, y: -targetRegion.top }
  }

  const contentBounds = mergeRegions(occupiedRegions)
  const targetWidth = targetRegion.right - targetRegion.left
  const targetHeight = targetRegion.bottom - targetRegion.top
  const horizontalPositions = resolveCandidateAxisPositions(
    [contentBounds, ...occupiedRegions],
    targetWidth,
    gap,
    'horizontal'
  )
  const verticalPositions = resolveCandidateAxisPositions(
    [contentBounds, ...occupiedRegions],
    targetHeight,
    gap,
    'vertical'
  )
  let bestCandidate: PlacementCandidate | null = null

  for (const left of horizontalPositions) {
    for (const top of verticalPositions) {
      const region = {
        bottom: top + targetHeight,
        left,
        right: left + targetWidth,
        top
      }
      if (occupiedRegions.some((occupied) => overlapsWithGap(region, occupied, gap))) continue

      const candidate = {
        region,
        score: scoreCandidate(region, contentBounds, gap)
      } satisfies PlacementCandidate

      if (!bestCandidate || compareScores(candidate.score, bestCandidate.score) < 0) {
        bestCandidate = candidate
      }
    }
  }

  const selectedRegion = bestCandidate?.region ?? {
    bottom: contentBounds.bottom + gap + targetHeight,
    left: contentBounds.left,
    right: contentBounds.left + targetWidth,
    top: contentBounds.bottom + gap
  }

  return {
    x: selectedRegion.left - targetRegion.left,
    y: selectedRegion.top - targetRegion.top
  }
}

function resolveCandidateAxisPositions(
  regions: readonly TerminalCanvasPlacementRegion[],
  targetLength: number,
  gap: number,
  axis: 'horizontal' | 'vertical'
): number[] {
  const positions = regions.flatMap((region) => {
    const start = axis === 'horizontal' ? region.left : region.top
    const end = axis === 'horizontal' ? region.right : region.bottom

    return [
      start - gap - targetLength,
      start,
      Math.round((start + end - targetLength) / 2),
      end - targetLength,
      end + gap
    ]
  })

  return [...new Set(positions)].sort((left, right) => left - right)
}

function scoreCandidate(
  candidate: TerminalCanvasPlacementRegion,
  contentBounds: TerminalCanvasPlacementRegion,
  gap: number
): readonly [number, number, number, number, number, number] {
  const expandedBounds = mergeRegions([contentBounds, candidate])
  const areaExpansion = area(expandedBounds) - area(contentBounds)
  const perimeterExpansion = perimeter(expandedBounds) - perimeter(contentBounds)
  const centerDistance = squaredDistance(regionCenter(candidate), regionCenter(contentBounds))

  return [
    areaExpansion,
    perimeterExpansion,
    centerDistance,
    resolveDirectionRank(candidate, contentBounds, gap),
    candidate.top,
    candidate.left
  ]
}

function resolveDirectionRank(
  candidate: TerminalCanvasPlacementRegion,
  contentBounds: TerminalCanvasPlacementRegion,
  gap: number
): number {
  if (candidate.top >= contentBounds.bottom + gap) return 0
  if (candidate.left >= contentBounds.right + gap) return 1
  if (candidate.right <= contentBounds.left - gap) return 2
  if (candidate.bottom <= contentBounds.top - gap) return 3
  return 4
}

function overlapsWithGap(
  left: TerminalCanvasPlacementRegion,
  right: TerminalCanvasPlacementRegion,
  gap: number
): boolean {
  return (
    left.left < right.right + gap &&
    left.right > right.left - gap &&
    left.top < right.bottom + gap &&
    left.bottom > right.top - gap
  )
}

function mergeRegions(
  regions: readonly TerminalCanvasPlacementRegion[]
): TerminalCanvasPlacementRegion {
  return regions.reduce(
    (bounds, region) => ({
      bottom: Math.max(bounds.bottom, region.bottom),
      left: Math.min(bounds.left, region.left),
      right: Math.max(bounds.right, region.right),
      top: Math.min(bounds.top, region.top)
    }),
    {
      bottom: Number.NEGATIVE_INFINITY,
      left: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      top: Number.POSITIVE_INFINITY
    }
  )
}

function area(region: TerminalCanvasPlacementRegion): number {
  return (region.right - region.left) * (region.bottom - region.top)
}

function perimeter(region: TerminalCanvasPlacementRegion): number {
  return 2 * (region.right - region.left + region.bottom - region.top)
}

function regionCenter(region: TerminalCanvasPlacementRegion): {
  readonly x: number
  readonly y: number
} {
  return {
    x: (region.left + region.right) / 2,
    y: (region.top + region.bottom) / 2
  }
}

function squaredDistance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2
}

function compareScores(
  left: PlacementCandidate['score'],
  right: PlacementCandidate['score']
): number {
  for (const [index, value] of left.entries()) {
    const difference = value - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}
