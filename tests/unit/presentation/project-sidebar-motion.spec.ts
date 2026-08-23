import {
  createProjectSidebarMotionController,
  type ProjectSidebarMotionElements,
  type ProjectSidebarMotionFrameScheduler,
  type ProjectSidebarMotionSurface
} from '../../../src/presentation/app-shell/projectSidebarMotion'

describe('project sidebar motion', () => {
  it.each([
    {
      initialIsCollapsed: true,
      label: 'opening',
      nextIsCollapsed: false,
      progressesTowardTarget: (previous: number, current: number) => current >= previous
    },
    {
      initialIsCollapsed: false,
      label: 'closing',
      nextIsCollapsed: true,
      progressesTowardTarget: (previous: number, current: number) => current <= previous
    }
  ])(
    'keeps sidebar content within its endpoints without reverse motion while $label',
    ({ initialIsCollapsed, nextIsCollapsed, progressesTowardTarget }) => {
      const scheduler = createFrameScheduler()
      const elements = createElements()
      const controller = createProjectSidebarMotionController({ scheduler })

      controller.intentChanged(elements, {
        expandedWidth: 280,
        isCollapsed: initialIsCollapsed,
        reducedMotion: false
      })
      controller.intentChanged(elements, {
        expandedWidth: 280,
        isCollapsed: nextIsCollapsed,
        reducedMotion: false
      })

      const sidebarOffsets = advanceAndReadSidebarPresentation(scheduler, elements.sidebar, 280)

      expect(sidebarOffsets.every((offset) => offset >= -280 && offset <= 0)).toBe(true)
      expect(
        sidebarOffsets
          .slice(1)
          .every((offset, index) => progressesTowardTarget(sidebarOffsets[index] ?? offset, offset))
      ).toBe(true)
    }
  )

  it('moves compositor surfaces with a perceptible critically damped spring and settles at the expanded endpoint', () => {
    const scheduler = createFrameScheduler()
    const elements = createElements()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })

    expect(elements.sidebar.attributes.get('data-project-sidebar-motion-state')).toBe('opening')
    expect(elements.titlebar.attributes.get('data-project-sidebar-motion-state')).toBe('opening')
    scheduler.advanceNextFrame(100)
    expect(readTranslation(elements.spatial)).toBeGreaterThan(100)
    expect(readTranslation(elements.spatial)).toBeLessThan(280)
    expect(readTranslation(elements.center)).toBeCloseTo(readTranslation(elements.spatial) / 2, 4)
    expect(readTranslation(elements.titlebar)).toBeCloseTo(readTranslation(elements.sidebar), 4)

    const sidebarOffsets = advanceAndReadTranslations(scheduler, elements.sidebar)
    expect(sidebarOffsets.some((offset) => offset < 0)).toBe(true)
    expect(elements.spatial.properties.has('transform')).toBe(false)
    expect(elements.center.properties.has('transform')).toBe(false)
    expect(elements.statusbar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.properties.has('transform')).toBe(false)
    expect(elements.titlebar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.attributes.get('data-project-sidebar-motion-state')).toBe('expanded')
    expect(elements.titlebar.attributes.get('data-project-sidebar-motion-state')).toBe('expanded')
    expect(elements.spatial.attributes.get('data-project-sidebar-motion-state')).toBe('expanded')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('only writes compositor transforms while the spring is running', () => {
    const scheduler = createFrameScheduler()
    const elements = createElements()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()

    for (const surface of [
      elements.sidebar,
      elements.titlebar,
      elements.spatial,
      elements.center,
      elements.statusbar
    ]) {
      expect([...surface.properties.keys()]).toEqual(['transform'])
      expect(surface.properties.get('transform')).toContain('translate3d(')
    }
  })

  it('reverses from the current presentation without resetting its position', () => {
    const scheduler = createFrameScheduler()
    const elements = createElements()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()
    scheduler.advanceNextFrame()
    const spatialOffsetBeforeReversal = readTranslation(elements.spatial)
    const sidebarOffsetBeforeReversal = readTranslation(elements.sidebar)
    const titlebarOffsetBeforeReversal = readTranslation(elements.titlebar)

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })

    expect(readTranslation(elements.spatial)).toBe(spatialOffsetBeforeReversal)
    expect(readTranslation(elements.sidebar)).toBe(sidebarOffsetBeforeReversal)
    expect(readTranslation(elements.titlebar)).toBe(titlebarOffsetBeforeReversal)
    expect(elements.sidebar.attributes.get('data-project-sidebar-motion-state')).toBe('closing')
    expect(elements.titlebar.attributes.get('data-project-sidebar-motion-state')).toBe('closing')
    expect(elements.spatial.attributes.get('data-project-sidebar-motion-state')).toBe('closing')
    scheduler.advanceNextFrame()
    expect(readTranslation(elements.spatial)).toBeGreaterThan(spatialOffsetBeforeReversal)
    scheduler.advanceUntilIdle()
    expect(elements.spatial.properties.has('transform')).toBe(false)
    expect(elements.center.properties.has('transform')).toBe(false)
    expect(elements.statusbar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.properties.has('transform')).toBe(false)
    expect(elements.titlebar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
    expect(elements.titlebar.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
  })

  it('projects the requested endpoint immediately when reduced motion is active or changes', () => {
    const scheduler = createFrameScheduler()
    const elements = createElements()
    const controller = createProjectSidebarMotionController({ scheduler })

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()
    expect(readTranslation(elements.spatial)).toBeGreaterThan(0)

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: true
    })

    expect(elements.spatial.properties.has('transform')).toBe(false)
    expect(elements.center.properties.has('transform')).toBe(false)
    expect(elements.statusbar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.properties.has('transform')).toBe(false)
    expect(elements.titlebar.properties.has('transform')).toBe(false)
    expect(elements.sidebar.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
    expect(elements.titlebar.attributes.get('data-project-sidebar-motion-state')).toBe('collapsed')
    expect(scheduler.pendingFrames()).toBe(0)
  })

  it('consumes all elapsed time when a rendering frame is delayed', () => {
    const regularScheduler = createFrameScheduler()
    const delayedScheduler = createFrameScheduler()
    const regularElements = createElements()
    const delayedElements = createElements()
    const regularController = createProjectSidebarMotionController({ scheduler: regularScheduler })
    const delayedController = createProjectSidebarMotionController({ scheduler: delayedScheduler })

    for (const [controller, elements] of [
      [regularController, regularElements],
      [delayedController, delayedElements]
    ] as const) {
      controller.intentChanged(elements, {
        expandedWidth: 280,
        isCollapsed: true,
        reducedMotion: false
      })
      controller.intentChanged(elements, {
        expandedWidth: 280,
        isCollapsed: false,
        reducedMotion: false
      })
    }

    for (let frame = 0; frame < 12; frame += 1) regularScheduler.advanceNextFrame()
    delayedScheduler.advanceNextFrame(100)

    expect(readTranslation(delayedElements.spatial)).toBeCloseTo(
      readTranslation(regularElements.spatial),
      4
    )
    expect(readTranslation(delayedElements.sidebar)).toBeCloseTo(
      readTranslation(regularElements.sidebar),
      4
    )
    expect(readTranslation(delayedElements.titlebar)).toBeCloseTo(
      readTranslation(regularElements.titlebar),
      4
    )
  })

  it('publishes one interaction window for opening, reversal, and settlement', () => {
    const scheduler = createFrameScheduler()
    const elements = createElements()
    const activity: boolean[] = []
    const controller = createProjectSidebarMotionController({
      onMotionActiveChange: (isActive) => activity.push(isActive),
      scheduler
    })

    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: false,
      reducedMotion: false
    })
    scheduler.advanceNextFrame()
    controller.intentChanged(elements, {
      expandedWidth: 280,
      isCollapsed: true,
      reducedMotion: false
    })
    scheduler.advanceUntilIdle()

    expect(activity).toEqual([true, false])
  })
})

function readTranslation(surface: ReturnType<typeof createSurface>): number {
  const transform = surface.properties.get('transform') ?? 'translate3d(0px, 0, 0)'
  return Number.parseFloat(transform.slice(transform.indexOf('(') + 1))
}

function advanceAndReadTranslations(
  scheduler: ReturnType<typeof createFrameScheduler>,
  surface: ReturnType<typeof createSurface>
): number[] {
  const values: number[] = []
  for (let frame = 0; frame < 240 && scheduler.pendingFrames() > 0; frame += 1) {
    scheduler.advanceNextFrame()
    values.push(readTranslation(surface))
  }
  return values
}

function advanceAndReadSidebarPresentation(
  scheduler: ReturnType<typeof createFrameScheduler>,
  surface: ReturnType<typeof createSurface>,
  expandedWidth: number
): number[] {
  const values = [readSidebarPresentation(surface, expandedWidth)]
  for (let frame = 0; frame < 240 && scheduler.pendingFrames() > 0; frame += 1) {
    scheduler.advanceNextFrame()
    values.push(readSidebarPresentation(surface, expandedWidth))
  }
  return values
}

function readSidebarPresentation(
  surface: ReturnType<typeof createSurface>,
  expandedWidth: number
): number {
  if (surface.properties.has('transform')) return readTranslation(surface)
  return surface.attributes.get('data-project-sidebar-motion-state') === 'collapsed'
    ? -expandedWidth
    : 0
}

function createElements(): ProjectSidebarMotionElements & {
  readonly sidebar: ReturnType<typeof createSurface>
  readonly titlebar: ReturnType<typeof createSurface>
  readonly spatial: ReturnType<typeof createSurface>
  readonly center: ReturnType<typeof createSurface>
  readonly statusbar: ReturnType<typeof createSurface>
} {
  return {
    sidebar: createSurface(),
    titlebar: createSurface(),
    spatial: createSurface(),
    center: createSurface(),
    statusbar: createSurface()
  }
}

function createSurface(): ProjectSidebarMotionSurface & {
  readonly attributes: Map<string, string>
  readonly properties: Map<string, string>
} {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  return {
    attributes,
    properties,
    removeAttribute: (name) => attributes.delete(name),
    setAttribute: (name, value) => attributes.set(name, value),
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

function createFrameScheduler(): ProjectSidebarMotionFrameScheduler & {
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
