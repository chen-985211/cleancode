import { resolveTerminalMetadataPlacement } from '../../../../src/contexts/block-graph/presentation/view-models/terminalMetadataPlacement'

const viewport = { x: 300, y: 120, width: 900, height: 650 }
const anchors = [
  { x: 320, y: 140, width: 32, height: 32 },
  { x: 1140, y: 140, width: 32, height: 32 },
  { x: 750, y: 425, width: 32, height: 32 },
  { x: 320, y: 710, width: 32, height: 32 },
  { x: 1140, y: 710, width: 32, height: 32 },
  { x: 1600, y: 1000, width: 32, height: 32 }
]

describe('terminal metadata placement', () => {
  it.each(
    [0.35, 1, 1.6].flatMap((zoom) =>
      [480, 900, 1600].flatMap((height) => anchors.map((anchor) => ({ zoom, height, anchor })))
    )
  )('keeps the full editor visible without covering its toggle: %j', ({ zoom, height, anchor }) => {
    const size = { width: 460, height }
    const desired = {
      x: anchor.x + anchor.width - size.width * zoom,
      y: anchor.y + anchor.height + 8
    }
    const result = resolveTerminalMetadataPlacement({ viewport, anchor, size, desired, zoom })
    const right = result.x + size.width * zoom * result.scale
    const bottom = result.y + size.height * zoom * result.scale
    expect(result.scale).toBeGreaterThan(0)
    expect(result.scale).toBeLessThanOrEqual(1)
    expect(result.x).toBeGreaterThanOrEqual(viewport.x - 0.001)
    expect(result.y).toBeGreaterThanOrEqual(viewport.y - 0.001)
    expect(right).toBeLessThanOrEqual(viewport.x + viewport.width + 0.001)
    expect(bottom).toBeLessThanOrEqual(viewport.y + viewport.height + 0.001)
    expect(
      right <= anchor.x ||
        result.x >= anchor.x + anchor.width ||
        bottom <= anchor.y ||
        result.y >= anchor.y + anchor.height
    ).toBe(true)
  })

  it('preserves the normal anchor position and scale when there is enough room', () => {
    expect(
      resolveTerminalMetadataPlacement({
        viewport,
        anchor: { x: 1030, y: 180, width: 32, height: 32 },
        desired: { x: 620, y: 220 },
        size: { width: 460, height: 480 },
        zoom: 1
      })
    ).toEqual({ x: 620, y: 220, scale: 1 })
  })

  it('moves a bottom-edge editor before reducing its scale', () => {
    const result = resolveTerminalMetadataPlacement({
      viewport,
      anchor: anchors[4]!,
      desired: { x: 720, y: 750 },
      size: { width: 460, height: 480 },
      zoom: 1
    })
    expect(result.scale).toBe(1)
  })
})
