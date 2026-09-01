export function resolveCanvasObjectContextMenuPosition(input: {
  readonly menuHeight: number
  readonly menuWidth: number
  readonly pointerX: number
  readonly pointerY: number
  readonly viewportHeight: number
  readonly viewportWidth: number
}): { readonly left: number; readonly top: number } {
  const viewportPadding = 8
  const pointerOffset = 4
  const maximumLeft = Math.max(
    viewportPadding,
    input.viewportWidth - input.menuWidth - viewportPadding
  )
  const maximumTop = Math.max(
    viewportPadding,
    input.viewportHeight - input.menuHeight - viewportPadding
  )

  return {
    left: Math.min(Math.max(viewportPadding, input.pointerX + pointerOffset), maximumLeft),
    top: Math.min(Math.max(viewportPadding, input.pointerY + pointerOffset), maximumTop)
  }
}
