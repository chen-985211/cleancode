import type {
  WorkbenchNodeSize,
  WorkbenchScreenRect
} from '../creation/workbenchNodeCreationPolicy'

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
  const canvasVerticalCenter = (canvasRect.top + canvasRect.bottom) / 2
  const intersectingObstructions = obstructionRects.filter((rect) =>
    intersectsCanvas(rect, canvasRect)
  )
  const sideObstructions = intersectingObstructions.filter(
    (rect) =>
      spansVerticalCenter(rect, canvasVerticalCenter) &&
      (rect.left <= canvasRect.left || rect.right >= canvasRect.right)
  )
  const leftObstructionRight = sideObstructions
    .filter((rect) => rect.left <= canvasRect.left && rect.right < canvasRect.right)
    .reduce((furthestRight, rect) => Math.max(furthestRight, rect.right), canvasRect.left)
  const rightObstructionLeft = sideObstructions
    .filter((rect) => rect.right >= canvasRect.right && rect.left > canvasRect.left)
    .reduce((furthestLeft, rect) => Math.min(furthestLeft, rect.left), canvasRect.right)
  const verticalObstructions = intersectingObstructions.filter(
    (rect) => !sideObstructions.includes(rect)
  )
  const topObstructionBottom = verticalObstructions
    .filter((rect) => (rect.top + rect.bottom) / 2 <= canvasVerticalCenter)
    .reduce((lowestBottom, rect) => Math.max(lowestBottom, rect.bottom), canvasRect.top)
  const bottomObstructionTop = verticalObstructions
    .filter((rect) => (rect.top + rect.bottom) / 2 > canvasVerticalCenter)
    .reduce((highestTop, rect) => Math.min(highestTop, rect.top), canvasRect.bottom)
  const left = Math.max(canvasRect.left + normalizedMargin, leftObstructionRight + normalizedMargin)
  const right = Math.min(
    canvasRect.right - normalizedMargin,
    rightObstructionLeft - normalizedMargin
  )
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
  const measuredSurfaceRect = canvas
    .closest<HTMLElement>('.canvas-surface')
    ?.getBoundingClientRect()
  const measuredVisibleCanvasRect = measuredSurfaceRect
    ? intersectRects(measuredCanvasRect, measuredSurfaceRect)
    : measuredCanvasRect
  const canvasRect =
    measuredVisibleCanvasRect.width > 0 && measuredVisibleCanvasRect.height > 0
      ? measuredVisibleCanvasRect
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

function spansVerticalCenter(rect: ClientRect, canvasVerticalCenter: number): boolean {
  return rect.top <= canvasVerticalCenter && rect.bottom >= canvasVerticalCenter
}

function intersectRects(
  first: DOMRect,
  second: DOMRect
): ClientRect & { readonly width: number; readonly height: number } {
  const left = Math.max(first.left, second.left)
  const top = Math.max(first.top, second.top)
  const right = Math.min(first.right, second.right)
  const bottom = Math.min(first.bottom, second.bottom)

  return {
    bottom,
    height: Math.max(0, bottom - top),
    left,
    right,
    top,
    width: Math.max(0, right - left)
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
