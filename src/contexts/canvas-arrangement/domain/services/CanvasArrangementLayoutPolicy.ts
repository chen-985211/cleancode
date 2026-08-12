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

const arrangementGap = 48
const stackOffset = 10

export function createStackedCanvasLayout(
  input: readonly CanvasArrangementLayoutItem[],
  existingAnchor?: { readonly x: number; readonly y: number }
): StackedCanvasLayoutPlan {
  const items = normalizeItems(input, existingAnchor === undefined)
  const maximumWidth = Math.max(...items.map((item) => item.size.width))
  const maximumHeight = Math.max(...items.map((item) => item.size.height))
  const spread = stackOffset * (items.length - 1)
  const anchor = existingAnchor ?? createStackAnchor(items, maximumWidth, maximumHeight, spread)
  validateAnchor(anchor)

  return {
    anchor,
    layouts: items.map((item, index) => ({
      key: item.key,
      position: {
        x: anchor.x + (maximumWidth - item.size.width) / 2 + index * stackOffset,
        y: anchor.y + (maximumHeight - item.size.height) / 2 + index * stackOffset
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
          x: Math.round(anchor.x + (maximumWidth - item.size.width) / 2 + index * stepX),
          y: Math.round(anchor.y + (maximumHeight - item.size.height) / 2 + index * stepY)
        }
      }
    })
  }
}

export function createGridCanvasLayout(input: readonly CanvasArrangementLayoutItem[]): {
  readonly layouts: readonly CanvasArrangementLayout[]
} {
  const items = normalizeItems(input, true)
  const bounds = mergeBounds(items)
  const columnCount = Math.ceil(Math.sqrt(items.length))
  const rowCount = Math.ceil(items.length / columnCount)
  const columnWidths = Array.from({ length: columnCount }, () => 0)
  const rowHeights = Array.from({ length: rowCount }, () => 0)

  items.forEach((item, index) => {
    const column = index % columnCount
    const row = Math.floor(index / columnCount)
    columnWidths[column] = Math.max(columnWidths[column] ?? 0, item.size.width)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, item.size.height)
  })

  const gridWidth = sum(columnWidths) + arrangementGap * (columnCount - 1)
  const gridHeight = sum(rowHeights) + arrangementGap * (rowCount - 1)
  const gridOrigin = {
    x: bounds.left + bounds.width / 2 - gridWidth / 2,
    y: bounds.top + bounds.height / 2 - gridHeight / 2
  }

  return {
    layouts: items.map((item, index) => {
      const column = index % columnCount
      const row = Math.floor(index / columnCount)
      return {
        key: item.key,
        position: {
          x: gridOrigin.x + sum(columnWidths.slice(0, column)) + arrangementGap * column,
          y: gridOrigin.y + sum(rowHeights.slice(0, row)) + arrangementGap * row
        }
      }
    })
  }
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

function createStackAnchor(
  items: readonly CanvasArrangementLayoutItem[],
  maximumWidth: number,
  maximumHeight: number,
  spread: number
) {
  const bounds = mergeBounds(items)
  return {
    x: bounds.left + bounds.width / 2 - (maximumWidth + spread) / 2,
    y: bounds.top + bounds.height / 2 - (maximumHeight + spread) / 2
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
