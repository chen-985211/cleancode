import type { CanvasArrangementItemReference } from '../aggregates/CanvasArrangementTypes'
import {
  createGridCanvasLayout,
  normalizeCanvasArrangementItems,
  type CanvasArrangementLayout,
  type CanvasArrangementLayoutItem
} from './CanvasArrangementLayoutPolicy'

export interface CanvasOrganizationLayoutItem extends CanvasArrangementLayoutItem {
  readonly kind: CanvasArrangementItemReference['kind']
}

const organizationRegionGap = 96

export function createOrganizedCanvasLayout(input: readonly CanvasOrganizationLayoutItem[]): {
  readonly layouts: readonly CanvasArrangementLayout[]
} {
  const items = normalizeCanvasArrangementItems(input, false, 1)
  const regions = [
    items.filter((item) => item.kind === 'agent'),
    items.filter((item) => item.kind !== 'agent')
  ]
    .filter((items) => items.length > 0)
    .map(createRegion)
  const totalWidth =
    regions.reduce((width, region) => width + region.width, 0) +
    Math.max(0, regions.length - 1) * organizationRegionGap
  let regionX = -totalWidth / 2
  const layouts: CanvasArrangementLayout[] = []
  for (const region of regions) {
    layouts.push(
      ...region.layouts.map((layout) => ({
        key: layout.key,
        position: {
          x: regionX + layout.position.x - region.left,
          y: layout.position.y - region.top - region.height / 2
        }
      }))
    )
    regionX += region.width + organizationRegionGap
  }
  return { layouts }
}

function createRegion(items: readonly CanvasOrganizationLayoutItem[]) {
  // Identity breaks equal-size ties independently of previous visual positions.
  const normalized = items.map((item) => ({ ...item, position: { x: 0, y: 0 } }))
  const layouts =
    normalized.length === 1
      ? [{ key: normalized[0]!.key, position: { x: 0, y: 0 } }]
      : createGridCanvasLayout(normalized).layouts
  const sizes = new Map(items.map((item) => [item.key, item.size]))
  const left = Math.min(...layouts.map((layout) => layout.position.x))
  const top = Math.min(...layouts.map((layout) => layout.position.y))
  const right = Math.max(
    ...layouts.map((layout) => layout.position.x + sizes.get(layout.key)!.width)
  )
  const bottom = Math.max(
    ...layouts.map((layout) => layout.position.y + sizes.get(layout.key)!.height)
  )
  return { layouts, left, top, width: right - left, height: bottom - top }
}
