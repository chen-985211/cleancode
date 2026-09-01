import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../../../../presentation/shared/motion/motionSpring'

export interface ProjectReorderCardRect {
  readonly projectId: string
  readonly top: number
  readonly bottom: number
}

export interface ProjectReorderSpringSurface {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

interface ProjectReorderLayoutCard {
  readonly id: string
  readonly top: number
  readonly surface: ProjectReorderSpringSurface
}

export interface ProjectReorderFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface ProjectReorderSpringControllerOptions {
  readonly scheduler?: ProjectReorderFrameScheduler
}

interface DirectProjectOffset {
  readonly id: string
  readonly offset: number
}

interface DirectProjectOffsetInput {
  readonly currentBaseTop: number
  readonly pointerY: number
  readonly startCardTop: number
  readonly startPointerY: number
}

export interface ProjectReorderSpringController {
  readonly dispose: () => void
  readonly layoutChanged: (
    cards: readonly ProjectReorderLayoutCard[],
    preservePresentation: boolean
  ) => void
  readonly offsetFor: (projectId: string) => number
  readonly targetsChanged: (
    targets: ReadonlyMap<string, number>,
    direct: DirectProjectOffset | null,
    reducedMotion: boolean,
    onComplete: () => void
  ) => void
}

interface ProjectEntry {
  axis: SpringAxis
  baseTop: number
  surface: ProjectReorderSpringSurface
  target: number
}

const offsetProperty = '--project-reorder-y'
const springDynamics = { dampingRatio: 1, response: 0.34 }
const settlementThresholds = { speed: 0.02, value: 0.01 }

const browserFrameScheduler: ProjectReorderFrameScheduler = {
  cancelFrame: (frameId) => {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId)
    else window.clearTimeout(frameId)
  },
  now: () => window.performance.now(),
  requestFrame: (callback) => {
    if (typeof window.requestAnimationFrame === 'function')
      return window.requestAnimationFrame(callback)
    return window.setTimeout(() => callback(window.performance.now()), 1000 / 60)
  }
}

export function resolveProjectReorderPreviewOffsets(
  rects: readonly ProjectReorderCardRect[],
  sourceProjectId: string,
  dropIndex: number
): ReadonlyMap<string, number> {
  const offsets = new Map(rects.map((rect) => [rect.projectId, 0]))
  const sourceIndex = rects.findIndex((rect) => rect.projectId === sourceProjectId)
  const source = rects[sourceIndex]
  if (
    !source ||
    dropIndex < 0 ||
    dropIndex > rects.length ||
    dropIndex === sourceIndex ||
    dropIndex === sourceIndex + 1
  ) {
    return offsets
  }

  const previous = rects[sourceIndex - 1]
  const next = rects[sourceIndex + 1]
  const gap = Math.max(
    0,
    previous ? source.top - previous.bottom : next ? next.top - source.bottom : 0
  )
  const sourceOuterSpan = source.bottom - source.top + gap

  if (dropIndex < sourceIndex) {
    for (let index = dropIndex; index < sourceIndex; index += 1) {
      offsets.set(rects[index]!.projectId, sourceOuterSpan)
    }
  } else {
    for (let index = sourceIndex + 1; index < dropIndex; index += 1) {
      offsets.set(rects[index]!.projectId, -sourceOuterSpan)
    }
  }

  return offsets
}

export function resolveDirectProjectOffset({
  currentBaseTop,
  pointerY,
  startCardTop,
  startPointerY
}: DirectProjectOffsetInput): number {
  const desiredVisualTop = startCardTop + pointerY - startPointerY
  return desiredVisualTop - currentBaseTop
}

export function createProjectReorderSpringController({
  scheduler = browserFrameScheduler
}: ProjectReorderSpringControllerOptions = {}): ProjectReorderSpringController {
  let entries = new Map<string, ProjectEntry>()
  let directProjectId: string | null = null
  let directTimestamp = scheduler.now()
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()
  let pendingCompletion: (() => void) | null = null

  const present = (entry: ProjectEntry): void => {
    entry.surface.style.setProperty(offsetProperty, `${round(entry.axis.value)}px`)
  }

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const finish = (): void => {
    const complete = pendingCompletion
    pendingCompletion = null
    complete?.()
  }

  const hasUnsettledSpring = (): boolean =>
    [...entries.entries()].some(
      ([id, entry]) =>
        id !== directProjectId &&
        !isSpringAxisSettled(entry.axis, entry.target, settlementThresholds)
    )

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    if (!hasUnsettledSpring()) {
      finish()
      return
    }
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  function advanceFrame(timestamp: number): void {
    animationFrameId = null
    const elapsedSeconds = Math.max(0, (timestamp - lastFrameTimestamp) / 1000)
    lastFrameTimestamp = timestamp

    entries.forEach((entry, id) => {
      if (id === directProjectId) return
      entry.axis = advanceSpringAxis(entry.axis, entry.target, springDynamics, elapsedSeconds)
      if (isSpringAxisSettled(entry.axis, entry.target, settlementThresholds)) {
        entry.axis = { value: entry.target, velocity: 0 }
      }
      present(entry)
    })
    scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      entries.forEach((entry) => entry.surface.style.removeProperty(offsetProperty))
      entries.clear()
      pendingCompletion = null
    },
    layoutChanged: (cards, preservePresentation) => {
      const previousEntries = entries
      const nextEntries = new Map<string, ProjectEntry>()
      cards.forEach((card) => {
        const previous = previousEntries.get(card.id)
        const axis = previous
          ? {
              ...previous.axis,
              value: preservePresentation
                ? previous.baseTop + previous.axis.value - card.top
                : previous.axis.value
            }
          : { value: 0, velocity: 0 }
        if (previous && previous.surface !== card.surface) {
          previous.surface.style.removeProperty(offsetProperty)
        }
        const entry = {
          axis,
          baseTop: card.top,
          surface: card.surface,
          target: previous?.target ?? 0
        }
        nextEntries.set(card.id, entry)
        present(entry)
      })
      previousEntries.forEach((entry, id) => {
        if (!nextEntries.has(id)) entry.surface.style.removeProperty(offsetProperty)
      })
      entries = nextEntries
    },
    offsetFor: (projectId) => entries.get(projectId)?.axis.value ?? 0,
    targetsChanged: (targets, direct, reducedMotion, onComplete) => {
      pendingCompletion = onComplete
      const now = scheduler.now()
      entries.forEach((entry, id) => {
        entry.target = targets.get(id) ?? 0
        if (direct?.id === id) {
          const elapsedSeconds = Math.max((now - directTimestamp) / 1000, 1 / 240)
          const velocity =
            directProjectId === id ? (direct.offset - entry.axis.value) / elapsedSeconds : 0
          entry.axis = { value: direct.offset, velocity }
        } else {
          entry.axis = retargetSpringAxis(entry.axis, entry.target, 'preserve')
        }
        present(entry)
      })
      directProjectId = direct?.id ?? null
      directTimestamp = now

      if (reducedMotion) {
        cancelFrame()
        entries.forEach((entry, id) => {
          entry.axis = {
            value: direct?.id === id ? direct.offset : entry.target,
            velocity: 0
          }
          present(entry)
        })
        finish()
        return
      }

      scheduleFrame()
    }
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
