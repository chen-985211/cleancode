const fallbackCanvasSize = { width: 960, height: 640 }

export function readMinimapFocusCanvasSize(): { readonly width: number; readonly height: number } {
  const canvas = document.querySelector<HTMLElement>('.react-flow')

  return {
    width: resolveCanvasDimension(canvas?.clientWidth, fallbackCanvasSize.width),
    height: resolveCanvasDimension(canvas?.clientHeight, fallbackCanvasSize.height)
  }
}

function resolveCanvasDimension(value: number | undefined, fallback: number): number {
  return value && value > 0 ? value : fallback
}
