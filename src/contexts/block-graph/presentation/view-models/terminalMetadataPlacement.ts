export interface TerminalMetadataRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface PlacementInput {
  readonly viewport: TerminalMetadataRect
  readonly anchor: TerminalMetadataRect
  readonly desired: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
  readonly zoom: number
}

export function resolveTerminalMetadataPlacement({
  viewport,
  anchor,
  desired,
  size,
  zoom
}: PlacementInput): {
  readonly x: number
  readonly y: number
  readonly scale: number
} {
  const width = size.width * zoom
  const height = size.height * zoom
  const fit = (bounds: TerminalMetadataRect) => {
    const scale = Math.min(1, bounds.width / width, bounds.height / height)
    return {
      x: clamp(desired.x + width * (1 - scale), bounds.x, bounds.x + bounds.width - width * scale),
      y: clamp(desired.y, bounds.y, bounds.y + bounds.height - height * scale),
      scale
    }
  }
  const placement = fit(viewport)
  const gap = 8
  if (
    placement.x + width * placement.scale <= anchor.x - gap ||
    placement.x >= anchor.x + anchor.width + gap ||
    placement.y + height * placement.scale <= anchor.y - gap ||
    placement.y >= anchor.y + anchor.height + gap
  )
    return placement

  const right = viewport.x + viewport.width
  const bottom = viewport.y + viewport.height
  const regions = [
    { ...viewport, width: Math.min(right, anchor.x - gap) - viewport.x },
    {
      ...viewport,
      x: Math.max(viewport.x, anchor.x + anchor.width + gap),
      width: right - Math.max(viewport.x, anchor.x + anchor.width + gap)
    },
    { ...viewport, height: Math.min(bottom, anchor.y - gap) - viewport.y },
    {
      ...viewport,
      y: Math.max(viewport.y, anchor.y + anchor.height + gap),
      height: bottom - Math.max(viewport.y, anchor.y + anchor.height + gap)
    }
  ]
  const candidates = regions.filter((region) => region.width > 0 && region.height > 0).map(fit)
  const distance = (candidate: typeof placement) =>
    (candidate.x - placement.x) ** 2 + (candidate.y - placement.y) ** 2
  candidates.sort(
    (first, second) => second.scale - first.scale || distance(first) - distance(second)
  )
  return candidates[0] ?? placement
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum))
}
