import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface CanvasArrangementLayoutItem {
  readonly key: string
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}

export interface CanvasArrangementLayout {
  readonly key: string
  readonly position: { readonly x: number; readonly y: number }
}

export interface StackedCanvasLayoutPlan {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly layouts: readonly CanvasArrangementLayout[]
}

interface GridShelf {
  readonly height: number
  readonly items: readonly CanvasArrangementLayoutItem[]
  readonly width: number
}

interface GridShelfPlan {
  readonly height: number
  readonly shelves: readonly GridShelf[]
  readonly width: number
}

const arrangementGap = 48
const gridAspectPenaltyWeight = 0.6
const gridScoreTolerance = 1e-9
const stackOffset = 10

export function createStackedCanvasLayout(
  input: readonly CanvasArrangementLayoutItem[],
  existingAnchor?: { readonly x: number; readonly y: number }
): StackedCanvasLayoutPlan {
  const items = normalizeItems(input, existingAnchor === undefined)
  const anchor = existingAnchor ?? createStackAnchor(items)
  validateAnchor(anchor)

  return {
    anchor,
    layouts: items.map((item, index) => ({
      key: item.key,
      position: {
        x: anchor.x + index * stackOffset,
        y: anchor.y + index * stackOffset
      }
    }))
  }
}

export function createSpreadCanvasLayout(
  input: readonly CanvasArrangementLayoutItem[],
  anchor: { readonly x: number; readonly y: number }
): { readonly layouts: readonly CanvasArrangementLayout[] } {
  const items = normalizeItems(input, false)
  validateAnchor(anchor)
  const maximumWidth = Math.max(...items.map((item) => item.size.width))
  const maximumHeight = Math.max(...items.map((item) => item.size.height))
  const minimumWidth = Math.min(...items.map((item) => item.size.width))
  const minimumHeight = Math.min(...items.map((item) => item.size.height))
  const stepX = Math.min(
    Math.min(72, Math.max(24, Math.round(maximumWidth * 0.058))),
    Math.max(1, Math.round(minimumWidth * 0.35))
  )
  const stepY = Math.min(
    Math.min(52, Math.max(18, Math.round(maximumHeight * 0.064))),
    Math.max(1, Math.round(minimumHeight * 0.3))
  )

  return {
    layouts: items.map((item, index) => {
      return {
        key: item.key,
        position: {
          x: Math.round(anchor.x + index * stepX),
          y: Math.round(anchor.y + index * stepY)
        }
      }
    })
  }
}

export function createGridCanvasLayout(input: readonly CanvasArrangementLayoutItem[]): {
  readonly layouts: readonly CanvasArrangementLayout[]
} {
  const items = sortGridItems(normalizeItems(input, true))
  const bounds = mergeBounds(items)
  const plan = createGridShelfPlan(items)
  const gridOrigin = {
    x: bounds.left + bounds.width / 2 - plan.width / 2,
    y: bounds.top + bounds.height / 2 - plan.height / 2
  }
  const layouts: CanvasArrangementLayout[] = []
  let shelfY = gridOrigin.y

  for (const shelf of plan.shelves) {
    let itemX = gridOrigin.x
    for (const item of shelf.items) {
      layouts.push({
        key: item.key,
        position: {
          x: itemX,
          y: shelfY + shelf.height - item.size.height
        }
      })
      itemX += item.size.width + arrangementGap
    }
    shelfY += shelf.height + arrangementGap
  }

  return { layouts }
}

function sortGridItems(
  visuallyOrderedItems: readonly CanvasArrangementLayoutItem[]
): CanvasArrangementLayoutItem[] {
  return visuallyOrderedItems
    .map((item, visualIndex) => ({ item, visualIndex }))
    .sort(
      (left, right) =>
        itemArea(right.item) - itemArea(left.item) ||
        Math.max(right.item.size.width, right.item.size.height) -
          Math.max(left.item.size.width, left.item.size.height) ||
        left.visualIndex - right.visualIndex
    )
    .map(({ item }) => item)
}

function createGridShelfPlan(items: readonly CanvasArrangementLayoutItem[]): GridShelfPlan {
  const contentArea = sum(items.map(itemArea))
  const candidateWidths = createGridCandidateWidths(items)
  let bestPlan: GridShelfPlan | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidateWidth of candidateWidths) {
    const shelves = packGridShelves(items, candidateWidth)
    const width = Math.max(...shelves.map((shelf) => shelf.width))
    const height = sum(shelves.map((shelf) => shelf.height)) + arrangementGap * (shelves.length - 1)
    const plan = { height, shelves, width }
    const score = gridPlanScore(plan, contentArea)
    if (isBetterGridPlan(plan, score, bestPlan, bestScore)) {
      bestPlan = plan
      bestScore = score
    }
  }

  return bestPlan!
}

function createGridCandidateWidths(
  items: readonly CanvasArrangementLayoutItem[]
): readonly number[] {
  const widths = new Set<number>()
  for (let start = 0; start < items.length; start += 1) {
    let width = 0
    for (let end = start; end < items.length; end += 1) {
      width += items[end]!.size.width + (end === start ? 0 : arrangementGap)
      widths.add(width)
    }
  }
  return [...widths].sort((left, right) => left - right)
}

function packGridShelves(
  items: readonly CanvasArrangementLayoutItem[],
  maximumWidth: number
): readonly GridShelf[] {
  const shelves: GridShelf[] = []
  let shelfItems: CanvasArrangementLayoutItem[] = []
  let shelfWidth = 0
  let shelfHeight = 0

  const finishShelf = (): void => {
    if (shelfItems.length === 0) return
    shelves.push({ height: shelfHeight, items: shelfItems, width: shelfWidth })
    shelfItems = []
    shelfWidth = 0
    shelfHeight = 0
  }

  for (const item of items) {
    const nextWidth =
      shelfItems.length === 0 ? item.size.width : shelfWidth + arrangementGap + item.size.width
    if (shelfItems.length > 0 && nextWidth > maximumWidth) finishShelf()
    shelfWidth =
      shelfItems.length === 0 ? item.size.width : shelfWidth + arrangementGap + item.size.width
    shelfHeight = Math.max(shelfHeight, item.size.height)
    shelfItems.push(item)
  }
  finishShelf()
  return shelves
}

function gridPlanScore(plan: GridShelfPlan, contentArea: number): number {
  const footprintCost = (plan.width * plan.height) / contentArea
  const aspectCost = Math.abs(Math.log(plan.width / plan.height))
  return footprintCost + aspectCost * gridAspectPenaltyWeight
}

function isBetterGridPlan(
  candidate: GridShelfPlan,
  candidateScore: number,
  current: GridShelfPlan | null,
  currentScore: number
): boolean {
  if (!current || candidateScore < currentScore - gridScoreTolerance) return true
  if (Math.abs(candidateScore - currentScore) > gridScoreTolerance) return false

  const candidateArea = candidate.width * candidate.height
  const currentArea = current.width * current.height
  if (candidateArea !== currentArea) return candidateArea < currentArea
  const candidateAspect = Math.abs(Math.log(candidate.width / candidate.height))
  const currentAspect = Math.abs(Math.log(current.width / current.height))
  if (candidateAspect !== currentAspect) return candidateAspect < currentAspect
  if (candidate.shelves.length !== current.shelves.length) {
    return candidate.shelves.length < current.shelves.length
  }
  return candidate.width < current.width
}

function itemArea(item: CanvasArrangementLayoutItem): number {
  return item.size.width * item.size.height
}

function normalizeItems(
  input: readonly CanvasArrangementLayoutItem[],
  sortVisually: boolean
): CanvasArrangementLayoutItem[] {
  if (input.length < 2) {
    invalid('Canvas arrangement requires at least two objects.')
  }
  const items = input.map((item) => {
    const key = item.key.trim()
    if (!key) invalid('Canvas arrangement object key cannot be empty.')
    const values = [item.position.x, item.position.y, item.size.width, item.size.height]
    if (!values.every(Number.isFinite) || item.size.width <= 0 || item.size.height <= 0) {
      invalid('Canvas arrangement object geometry is invalid.')
    }
    return { ...item, key }
  })
  if (new Set(items.map((item) => item.key)).size !== items.length) {
    invalid('Canvas arrangement object keys must be unique.')
  }
  return sortVisually
    ? items.sort(
        (left, right) =>
          left.position.y - right.position.y ||
          left.position.x - right.position.x ||
          left.key.localeCompare(right.key)
      )
    : items
}

function createStackAnchor(items: readonly CanvasArrangementLayoutItem[]) {
  const bounds = mergeBounds(items)
  const stackWidth = Math.max(...items.map((item, index) => item.size.width + index * stackOffset))
  const stackHeight = Math.max(
    ...items.map((item, index) => item.size.height + index * stackOffset)
  )
  return {
    x: bounds.left + bounds.width / 2 - stackWidth / 2,
    y: bounds.top + bounds.height / 2 - stackHeight / 2
  }
}

function validateAnchor(anchor: { readonly x: number; readonly y: number }): void {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    invalid('Canvas stack anchor must use finite coordinates.')
  }
}

function mergeBounds(items: readonly CanvasArrangementLayoutItem[]) {
  const left = Math.min(...items.map((item) => item.position.x))
  const top = Math.min(...items.map((item) => item.position.y))
  const right = Math.max(...items.map((item) => item.position.x + item.size.width))
  const bottom = Math.max(...items.map((item) => item.position.y + item.size.height))
  return { left, top, width: right - left, height: bottom - top }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function invalid(message: string): never {
  throw createExpectedAppError('CANVAS_ARRANGEMENT_INVALID', message)
}
