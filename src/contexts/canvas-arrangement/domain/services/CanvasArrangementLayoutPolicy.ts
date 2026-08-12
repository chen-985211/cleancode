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
const fanArcOffset = 24

export function createStackedCanvasLayout(
  input: readonly CanvasArrangementLayoutItem[]
): StackedCanvasLayoutPlan {
  const items = normalizeItems(input)
  const bounds = mergeBounds(items)
  const maximumWidth = Math.max(...items.map((item) => item.size.width))
  const maximumHeight = Math.max(...items.map((item) => item.size.height))
  const spread = stackOffset * (items.length - 1)
  const anchor = {
    x: bounds.left + bounds.width / 2 - (maximumWidth + spread) / 2,
    y: bounds.top + bounds.height / 2 - (maximumHeight + spread) / 2
  }

  return {
    anchor,
    layouts: items.map((item, index) => ({
      key: item.key,
      position: { x: anchor.x + index * stackOffset, y: anchor.y + index * stackOffset }
    }))
  }
}

export function createExpandedCanvasLayout(
  input: readonly CanvasArrangementLayoutItem[],
  anchor: { readonly x: number; readonly y: number }
): { readonly layouts: readonly CanvasArrangementLayout[] } {
  const items = normalizeItems(input)
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    invalid('Canvas arrangement anchor must use finite coordinates.')
  }
  const maximumWidth = Math.max(...items.map((item) => item.size.width))
  const maximumHeight = Math.max(...items.map((item) => item.size.height))
  const center = { x: anchor.x + maximumWidth / 2, y: anchor.y + maximumHeight / 2 }
  const totalWidth =
    items.reduce((sum, item) => sum + item.size.width, 0) + arrangementGap * (items.length - 1)
  const middleIndex = (items.length - 1) / 2
  let nextX = center.x - totalWidth / 2

  return {
    layouts: items.map((item, index) => {
      const layout = {
        key: item.key,
        position: {
          x: nextX,
          y: center.y - item.size.height / 2 + Math.abs(index - middleIndex) * fanArcOffset
        }
      }
      nextX += item.size.width + arrangementGap
      return layout
    })
  }
}

export function createGridCanvasLayout(input: readonly CanvasArrangementLayoutItem[]): {
  readonly layouts: readonly CanvasArrangementLayout[]
} {
  const items = normalizeItems(input)
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
  input: readonly CanvasArrangementLayoutItem[]
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
  return items.sort(
    (left, right) =>
      left.position.y - right.position.y ||
      left.position.x - right.position.x ||
      left.key.localeCompare(right.key)
  )
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
