import type { WorkbenchNodeSize, WorkbenchScreenRect } from './workbenchNodeCreationPolicy'

export const workbenchViewportSafeMargin = 24
export const workbenchCanvasObstructionAttribute = 'data-workbench-canvas-obstruction'

interface ClientRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export function resolveWorkbenchSafeViewport({
  canvasRect,
  obstructionRects,
  margin = workbenchViewportSafeMargin
}: {
  readonly canvasRect: ClientRect
  readonly obstructionRects: readonly ClientRect[]
  readonly margin?: number
}): WorkbenchScreenRect {
  const normalizedMargin = Math.max(0, margin)
  const left = canvasRect.left + normalizedMargin
  const right = canvasRect.right - normalizedMargin
  const canvasVerticalCenter = (canvasRect.top + canvasRect.bottom) / 2
  const intersectingObstructions = obstructionRects.filter((rect) =>
    intersectsCanvas(rect, canvasRect)
  )
  const topObstructionBottom = intersectingObstructions
    .filter((rect) => (rect.top + rect.bottom) / 2 <= canvasVerticalCenter)
    .reduce((lowestBottom, rect) => Math.max(lowestBottom, rect.bottom), canvasRect.top)
  const bottomObstructionTop = intersectingObstructions
    .filter((rect) => (rect.top + rect.bottom) / 2 > canvasVerticalCenter)
    .reduce((highestTop, rect) => Math.min(highestTop, rect.top), canvasRect.bottom)
  const top = Math.max(canvasRect.top + normalizedMargin, topObstructionBottom + normalizedMargin)
  const bottom = Math.min(
    canvasRect.bottom - normalizedMargin,
    bottomObstructionTop - normalizedMargin
  )

  if (right <= left || bottom <= top) {
    throw new RangeError('Canvas chrome leaves no safe viewport for a created workbench node.')
  }

  return {
    x: left - canvasRect.left,
    y: top - canvasRect.top,
    width: right - left,
    height: bottom - top
  }
}

export function readWorkbenchCanvasCreationGeometry(): {
  readonly canvasSize: WorkbenchNodeSize
  readonly safeViewport: WorkbenchScreenRect
} {
  const canvas = document.querySelector<HTMLElement>('.react-flow')

  if (!canvas) {
    throw new Error('The workbench canvas is not mounted.')
  }

  const measuredCanvasRect = canvas.getBoundingClientRect()
  const canvasRect =
    measuredCanvasRect.width > 0 && measuredCanvasRect.height > 0
      ? measuredCanvasRect
      : resolvePreLayoutCanvasRect(canvas)
  const obstructionRects = Array.from(
    document.querySelectorAll<HTMLElement>(`[${workbenchCanvasObstructionAttribute}]`)
  ).map((element) => element.getBoundingClientRect())

  return {
    canvasSize: {
      width: canvasRect.width,
      height: canvasRect.height
    },
    safeViewport: resolveWorkbenchSafeViewport({ canvasRect, obstructionRects })
  }
}

function resolvePreLayoutCanvasRect(canvas: HTMLElement): ClientRect & {
  readonly width: number
  readonly height: number
} {
  const width = canvas.clientWidth || window.innerWidth
  const height = canvas.clientHeight || window.innerHeight

  if (width <= 0 || height <= 0) {
    throw new RangeError('The workbench canvas has no measurable viewport.')
  }

  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    top: 0,
    width
  }
}

function intersectsCanvas(rect: ClientRect, canvasRect: ClientRect): boolean {
  return (
    rect.right > canvasRect.left &&
    rect.left < canvasRect.right &&
    rect.bottom > canvasRect.top &&
    rect.top < canvasRect.bottom
  )
}
