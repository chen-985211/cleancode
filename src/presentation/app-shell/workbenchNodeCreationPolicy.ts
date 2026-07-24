import {
  maximumCanvasZoom,
  minimumCanvasZoom,
  type CanvasViewportSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

export const workbenchNodePlacementGap = 64

export interface WorkbenchNodeSize {
  readonly width: number
  readonly height: number
}

export interface WorkbenchNodePosition {
  readonly x: number
  readonly y: number
}

export interface WorkbenchCanvasRect {
  readonly id: string
  readonly position: WorkbenchNodePosition
  readonly size: WorkbenchNodeSize
}

export interface WorkbenchScreenRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface ResolveWorkbenchNodeCreationPlanInput {
  readonly canvasSize: WorkbenchNodeSize
  readonly currentViewport: CanvasViewportSnapshot
  readonly nodeSize: WorkbenchNodeSize
  readonly occupiedRects: readonly WorkbenchCanvasRect[]
  readonly safeViewport: WorkbenchScreenRect
}

interface ResolveWorkbenchNodeCreationViewportInput {
  readonly canvasSize: WorkbenchNodeSize
  readonly nodePosition: WorkbenchNodePosition
  readonly nodeSize: WorkbenchNodeSize
  readonly safeViewport: WorkbenchScreenRect
}

export function resolveWorkbenchNodeCreationPlan({
  canvasSize,
  currentViewport,
  nodeSize,
  occupiedRects,
  safeViewport
}: ResolveWorkbenchNodeCreationPlanInput): {
  readonly position: WorkbenchNodePosition
  readonly viewport: CanvasViewportSnapshot
} {
  const normalizedSafeViewport = normalizeSafeViewport(canvasSize, safeViewport)
  const currentZoom = normalizeCurrentZoom(currentViewport.zoom)
  const safeCenter = centerOf(normalizedSafeViewport)
  const anchor = {
    x: (safeCenter.x - currentViewport.x) / currentZoom,
    y: (safeCenter.y - currentViewport.y) / currentZoom
  }
  const preferredRegion = screenRectToCanvasRect(
    normalizedSafeViewport,
    currentViewport,
    currentZoom
  )
  const position = resolveNearestAvailablePosition({
    anchor,
    nodeSize: normalizeSize(nodeSize),
    occupiedRects: normalizeOccupiedRects(occupiedRects),
    preferredRegion
  })

  return {
    position,
    viewport: resolveWorkbenchNodeCreationViewport({
      canvasSize,
      nodePosition: position,
      nodeSize,
      safeViewport: normalizedSafeViewport
    })
  }
}

export function resolveWorkbenchNodeCreationViewport({
  canvasSize,
  nodePosition,
  nodeSize,
  safeViewport
}: ResolveWorkbenchNodeCreationViewportInput): CanvasViewportSnapshot {
  const normalizedNodeSize = normalizeSize(nodeSize)
  const normalizedSafeViewport = normalizeSafeViewport(canvasSize, safeViewport)
  const fitZoom = Math.min(
    normalizedSafeViewport.width / normalizedNodeSize.width,
    normalizedSafeViewport.height / normalizedNodeSize.height
  )

  if (fitZoom < minimumCanvasZoom) {
    throw new RangeError('The created workbench node cannot fit inside the safe canvas viewport.')
  }

  const zoom = Math.min(maximumCanvasZoom, 1, fitZoom)
  const safeCenter = centerOf(normalizedSafeViewport)
  const nodeCenter = {
    x: nodePosition.x + normalizedNodeSize.width / 2,
    y: nodePosition.y + normalizedNodeSize.height / 2
  }

  return {
    x: safeCenter.x - nodeCenter.x * zoom,
    y: safeCenter.y - nodeCenter.y * zoom,
    zoom
  }
}

function resolveNearestAvailablePosition({
  anchor,
  nodeSize,
  occupiedRects,
  preferredRegion
}: {
  readonly anchor: WorkbenchNodePosition
  readonly nodeSize: WorkbenchNodeSize
  readonly occupiedRects: readonly WorkbenchCanvasRect[]
  readonly preferredRegion: WorkbenchScreenRect
}): WorkbenchNodePosition {
  const centeredPosition = {
    x: anchor.x - nodeSize.width / 2,
    y: anchor.y - nodeSize.height / 2
  }

  if (isAvailable(centeredPosition, nodeSize, occupiedRects)) {
    return centeredPosition
  }

  const xCandidates = new Set([centeredPosition.x])
  const yCandidates = new Set([centeredPosition.y])

  for (const occupied of occupiedRects) {
    xCandidates.add(occupied.position.x - workbenchNodePlacementGap - nodeSize.width)
    xCandidates.add(occupied.position.x + occupied.size.width + workbenchNodePlacementGap)
    yCandidates.add(occupied.position.y - workbenchNodePlacementGap - nodeSize.height)
    yCandidates.add(occupied.position.y + occupied.size.height + workbenchNodePlacementGap)
  }

  const candidates = [...xCandidates].flatMap((x) => [...yCandidates].map((y) => ({ x, y })))

  const availableCandidates = candidates
    .filter((position) => isAvailable(position, nodeSize, occupiedRects))
    .sort((left, right) => compareCandidates(left, right, nodeSize, anchor, preferredRegion))

  return availableCandidates[0] ?? positionAfterOccupiedBounds(centeredPosition, occupiedRects)
}

function compareCandidates(
  left: WorkbenchNodePosition,
  right: WorkbenchNodePosition,
  nodeSize: WorkbenchNodeSize,
  anchor: WorkbenchNodePosition,
  preferredRegion: WorkbenchScreenRect
): number {
  const leftIsPreferred = containsRect(preferredRegion, {
    x: left.x,
    y: left.y,
    width: nodeSize.width,
    height: nodeSize.height
  })
  const rightIsPreferred = containsRect(preferredRegion, {
    x: right.x,
    y: right.y,
    width: nodeSize.width,
    height: nodeSize.height
  })

  if (leftIsPreferred !== rightIsPreferred) {
    return leftIsPreferred ? -1 : 1
  }

  const leftCenter = centerOfPosition(left, nodeSize)
  const rightCenter = centerOfPosition(right, nodeSize)
  const leftDistance = normalizedSquaredDistance(leftCenter, anchor, nodeSize)
  const rightDistance = normalizedSquaredDistance(rightCenter, anchor, nodeSize)
  const verticalOffsetDifference =
    Math.abs(leftCenter.y - anchor.y) - Math.abs(rightCenter.y - anchor.y)
  const horizontalDirectionDifference =
    directionRank(leftCenter.x - anchor.x) - directionRank(rightCenter.x - anchor.x)
  const verticalDirectionDifference =
    directionRank(leftCenter.y - anchor.y) - directionRank(rightCenter.y - anchor.y)

  return (
    leftDistance - rightDistance ||
    verticalOffsetDifference ||
    horizontalDirectionDifference ||
    verticalDirectionDifference ||
    left.y - right.y ||
    left.x - right.x
  )
}

function isAvailable(
  position: WorkbenchNodePosition,
  size: WorkbenchNodeSize,
  occupiedRects: readonly WorkbenchCanvasRect[]
): boolean {
  const candidate = { id: 'candidate', position, size }

  return occupiedRects.every((occupied) => haveRequiredGap(candidate, occupied))
}

function haveRequiredGap(left: WorkbenchCanvasRect, right: WorkbenchCanvasRect): boolean {
  return (
    left.position.x + left.size.width + workbenchNodePlacementGap <= right.position.x ||
    right.position.x + right.size.width + workbenchNodePlacementGap <= left.position.x ||
    left.position.y + left.size.height + workbenchNodePlacementGap <= right.position.y ||
    right.position.y + right.size.height + workbenchNodePlacementGap <= left.position.y
  )
}

function positionAfterOccupiedBounds(
  centeredPosition: WorkbenchNodePosition,
  occupiedRects: readonly WorkbenchCanvasRect[]
): WorkbenchNodePosition {
  if (occupiedRects.length === 0) {
    return centeredPosition
  }

  return {
    x:
      Math.max(...occupiedRects.map((rect) => rect.position.x + rect.size.width)) +
      workbenchNodePlacementGap,
    y: centeredPosition.y
  }
}

function normalizeOccupiedRects(
  occupiedRects: readonly WorkbenchCanvasRect[]
): WorkbenchCanvasRect[] {
  return occupiedRects
    .map((rect) => ({
      id: rect.id,
      position: {
        x: normalizeCoordinate(rect.position.x),
        y: normalizeCoordinate(rect.position.y)
      },
      size: normalizeSize(rect.size)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function screenRectToCanvasRect(
  rect: WorkbenchScreenRect,
  viewport: CanvasViewportSnapshot,
  zoom: number
): WorkbenchScreenRect {
  return {
    x: (rect.x - viewport.x) / zoom,
    y: (rect.y - viewport.y) / zoom,
    width: rect.width / zoom,
    height: rect.height / zoom
  }
}

function normalizeSafeViewport(
  canvasSize: WorkbenchNodeSize,
  safeViewport: WorkbenchScreenRect
): WorkbenchScreenRect {
  const normalizedCanvasSize = normalizeSize(canvasSize)
  const left = clamp(normalizeCoordinate(safeViewport.x), 0, normalizedCanvasSize.width)
  const top = clamp(normalizeCoordinate(safeViewport.y), 0, normalizedCanvasSize.height)
  const right = clamp(
    left + normalizePositiveDimension(safeViewport.width),
    left,
    normalizedCanvasSize.width
  )
  const bottom = clamp(
    top + normalizePositiveDimension(safeViewport.height),
    top,
    normalizedCanvasSize.height
  )

  if (right === left || bottom === top) {
    throw new RangeError('The safe canvas viewport must have positive dimensions.')
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }
}

function normalizeSize(size: WorkbenchNodeSize): WorkbenchNodeSize {
  return {
    width: normalizePositiveDimension(size.width),
    height: normalizePositiveDimension(size.height)
  }
}

function normalizePositiveDimension(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Workbench geometry dimensions must be positive finite numbers.')
  }

  return value
}

function normalizeCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Workbench geometry coordinates must be finite numbers.')
  }

  return value
}

function normalizeCurrentZoom(zoom: number): number {
  const normalizedZoom = Number.isFinite(zoom) ? zoom : 1
  return clamp(normalizedZoom, minimumCanvasZoom, maximumCanvasZoom)
}

function centerOf(rect: WorkbenchScreenRect): WorkbenchNodePosition {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  }
}

function centerOfPosition(
  position: WorkbenchNodePosition,
  size: WorkbenchNodeSize
): WorkbenchNodePosition {
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2
  }
}

function normalizedSquaredDistance(
  left: WorkbenchNodePosition,
  right: WorkbenchNodePosition,
  nodeSize: WorkbenchNodeSize
): number {
  return (
    ((left.x - right.x) / (nodeSize.width + workbenchNodePlacementGap)) ** 2 +
    ((left.y - right.y) / (nodeSize.height + workbenchNodePlacementGap)) ** 2
  )
}

function directionRank(offset: number): number {
  return offset >= 0 ? 0 : 1
}

function containsRect(container: WorkbenchScreenRect, candidate: WorkbenchScreenRect): boolean {
  return (
    candidate.x >= container.x &&
    candidate.y >= container.y &&
    candidate.x + candidate.width <= container.x + container.width &&
    candidate.y + candidate.height <= container.y + container.height
  )
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
