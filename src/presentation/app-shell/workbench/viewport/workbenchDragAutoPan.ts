// Match React Flow's node-drag edge band and use one speed for native node
// dragging and the pointer-captured workflow drag adapter.
export const workbenchDragAutoPanSpeed = 15

export function workbenchDragAutoPanDelta(
  point: { readonly x: number; readonly y: number },
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
) {
  const band = 40
  const velocity = (value: number, size: number) =>
    value < band
      ? Math.min(band, Math.max(1, band - value)) / band
      : value > size - band
        ? -Math.min(band, Math.max(1, value - size + band)) / band
        : 0
  return {
    x: velocity(point.x - bounds.left, bounds.width) * workbenchDragAutoPanSpeed,
    y: velocity(point.y - bounds.top, bounds.height) * workbenchDragAutoPanSpeed
  }
}
