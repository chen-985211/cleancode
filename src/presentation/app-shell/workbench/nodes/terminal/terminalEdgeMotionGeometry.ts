import type { WorkbenchObjectMotion } from '../../../types/workbenchObjectMotion'

interface MotionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

// Read the spring's inline presentation, without forcing Chromium to lay out xterm.
export function readTerminalEdgeMotionGeometry(
  rect: MotionRect,
  style: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
  motion?: WorkbenchObjectMotion
): MotionRect & { readonly opacity: number } {
  const read = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(`--workbench-object-motion-${name}`))
    return Number.isFinite(value) ? value : fallback
  }
  const from = motion?.shellRect?.from
  const to = motion?.shellRect?.to
  const width = read('shell-width', from?.width ?? rect.width)
  const height = read('shell-height', from?.height ?? rect.height)
  const scale = read('scale', motion?.scale?.from ?? 1)
  const collapsing = motion?.kind === 'group-collapse'
  const x = read('x', collapsing ? 0 : (motion?.offset.x ?? 0))
  const y = read('y', collapsing ? 0 : (motion?.offset.y ?? 0))
  return {
    x: rect.x + x + read('shell-x', from && to ? from.x - to.x : 0) + (width * (1 - scale)) / 2,
    y: rect.y + y + read('shell-y', from && to ? from.y - to.y : 0) + (height * (1 - scale)) / 2,
    width: width * scale,
    height: height * scale,
    opacity: read('opacity', motion?.opacity?.from ?? (motion?.kind === 'group-expand' ? 0.28 : 1))
  }
}
