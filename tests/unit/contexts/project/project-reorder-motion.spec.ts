import {
  createProjectReorderSpringController,
  resolveDirectProjectOffset,
  resolveProjectReorderPreviewOffsets,
  type ProjectReorderFrameScheduler,
  type ProjectReorderSpringSurface
} from '../../../../src/contexts/project/presentation/motion/projectReorderMotion'

describe('project reorder motion', () => {
  it('keeps the grabbed point under the pointer when the list scrolls during a drag', () => {
    expect(
      resolveDirectProjectOffset({
        currentBaseTop: 240,
        pointerY: 180,
        startCardTop: 280,
        startPointerY: 300
      })
    ).toBe(-80)
  })

  it('moves uneven neighboring cards by the dragged card outer span', () => {
    const rects = [
      { projectId: 'alpha', top: 0, bottom: 40 },
      { projectId: 'beta', top: 52, bottom: 132 },
      { projectId: 'gamma', top: 144, bottom: 204 }
    ]

    expect(Object.fromEntries(resolveProjectReorderPreviewOffsets(rects, 'gamma', 0))).toEqual({
      alpha: 72,
      beta: 72,
      gamma: 0
    })
    expect(Object.fromEntries(resolveProjectReorderPreviewOffsets(rects, 'alpha', 3))).toEqual({
      alpha: 0,
      beta: -52,
      gamma: -52
    })
  })

  it('keeps the grabbed card one-to-one while neighboring cards spring toward open slots', () => {
    const scheduler = createFrameScheduler()
    const cards = createCards()
    const controller = createProjectReorderSpringController({ scheduler })
    controller.layoutChanged(cards, false)

    controller.targetsChanged(
      new Map([
        ['alpha', 72],
        ['beta', 72],
        ['gamma', 0]
      ]),
      { id: 'gamma', offset: -144 },
      false,
      vi.fn()
    )

    expect(readOffset(cards[2]!.surface)).toBe(-144)
    expect(readOffset(cards[0]!.surface)).toBe(0)
    scheduler.advanceNextFrame(50)
    expect(readOffset(cards[0]!.surface)).toBeGreaterThan(0)
    expect(readOffset(cards[0]!.surface)).toBeLessThan(72)
  })

  it('preserves the live screen position when authoritative order changes mid-spring', () => {
    const scheduler = createFrameScheduler()
    const cards = createCards()
    const controller = createProjectReorderSpringController({ scheduler })
    controller.layoutChanged(cards, false)
    controller.targetsChanged(
      new Map([
        ['alpha', 72],
        ['beta', 72],
        ['gamma', 0]
      ]),
      { id: 'gamma', offset: -120 },
      false,
      vi.fn()
    )
    scheduler.advanceNextFrame(50)
    const alphaVisualTop = cards[0]!.top + readOffset(cards[0]!.surface)
    const gammaVisualTop = cards[2]!.top + readOffset(cards[2]!.surface)

    controller.layoutChanged(
      [
        { ...cards[2]!, top: 0 },
        { ...cards[0]!, top: 72 },
        { ...cards[1]!, top: 124 }
      ],
      true
    )
    controller.targetsChanged(new Map(), null, false, vi.fn())

    expect(72 + readOffset(cards[0]!.surface)).toBeCloseTo(alphaVisualTop, 4)
    expect(readOffset(cards[2]!.surface)).toBeCloseTo(gammaVisualTop, 4)
    scheduler.advanceUntilIdle()
    cards.forEach(({ surface }) => expect(readOffset(surface)).toBe(0))
  })

  it('snaps spring targets while preserving direct manipulation for reduced motion', () => {
    const scheduler = createFrameScheduler()
    const cards = createCards()
    const completed = vi.fn()
    const controller = createProjectReorderSpringController({ scheduler })
    controller.layoutChanged(cards, false)
    controller.targetsChanged(
      new Map([
        ['alpha', 72],
        ['beta', 72]
      ]),
      { id: 'gamma', offset: -118 },
      true,
      completed
    )

    expect(readOffset(cards[0]!.surface)).toBe(72)
    expect(readOffset(cards[1]!.surface)).toBe(72)
    expect(readOffset(cards[2]!.surface)).toBe(-118)
    expect(completed).toHaveBeenCalledOnce()
    expect(scheduler.pendingFrames()).toBe(0)
  })
})

function createCards() {
  return [
    { id: 'alpha', top: 0, surface: createSurface() },
    { id: 'beta', top: 52, surface: createSurface() },
    { id: 'gamma', top: 144, surface: createSurface() }
  ]
}

function readOffset(surface: ReturnType<typeof createSurface>): number {
  return Number.parseFloat(surface.properties.get('--project-reorder-y') ?? '0')
}

function createSurface(): ProjectReorderSpringSurface & {
  readonly properties: Map<string, string>
} {
  const properties = new Map<string, string>()
  return {
    properties,
    style: {
      removeProperty: (property) => {
        const previousValue = properties.get(property) ?? ''
        properties.delete(property)
        return previousValue
      },
      setProperty: (property, value) => {
        properties.set(property, value ?? '')
      }
    }
  }
}

function createFrameScheduler(): ProjectReorderFrameScheduler & {
  readonly advanceNextFrame: (milliseconds?: number) => void
  readonly advanceUntilIdle: () => void
  readonly pendingFrames: () => number
} {
  let nextFrameId = 1
  let now = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  const advanceNextFrame = (milliseconds = 1000 / 120): void => {
    now += milliseconds
    const pendingCallbacks = [...callbacks.values()]
    callbacks.clear()
    pendingCallbacks.forEach((callback) => callback(now))
  }
  return {
    advanceNextFrame,
    advanceUntilIdle: () => {
      for (let frame = 0; frame < 240 && callbacks.size > 0; frame += 1) advanceNextFrame()
    },
    cancelFrame: (frameId) => callbacks.delete(frameId),
    now: () => now,
    pendingFrames: () => callbacks.size,
    requestFrame: (callback) => {
      const frameId = nextFrameId
      nextFrameId += 1
      callbacks.set(frameId, callback)
      return frameId
    }
  }
}
