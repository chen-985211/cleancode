export const mainWindowStateSchemaVersion = 1
export const mainWindowMinimumSize = { width: 960, height: 640 } as const
const mainWindowDefaultSize = { width: 1_200, height: 800 } as const

export interface MainWindowBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type MainWindowDisplayMode = 'normal' | 'maximized' | 'fullscreen'

export interface MainWindowStateSnapshot {
  readonly version: typeof mainWindowStateSchemaVersion
  readonly normalBounds: MainWindowBounds
  readonly displayMode: MainWindowDisplayMode
}

interface MainWindowDisplay {
  readonly isPrimary: boolean
  readonly workArea: MainWindowBounds
}

type VerticalInterval = readonly [start: number, end: number]

type MainWindowStartupPolicy =
  | { readonly mode: 'normal' }
  | {
      readonly mode: 'offscreen-inactive'
      readonly position: { readonly x: number; readonly y: number }
    }

export interface MainWindowStartupState {
  readonly normalBounds: MainWindowBounds
  readonly displayMode: MainWindowDisplayMode
}

export function resolveMainWindowFullScreenOptions(displayMode: MainWindowDisplayMode): {
  readonly fullscreen?: true
} {
  return displayMode === 'fullscreen' ? { fullscreen: true } : {}
}

export function decodeMainWindowState(value: unknown): MainWindowStateSnapshot | null {
  if (!isRecord(value) || value.version !== mainWindowStateSchemaVersion) return null
  if (!isMainWindowDisplayMode(value.displayMode) || !isRecord(value.normalBounds)) return null

  const { x, y, width, height } = value.normalBounds
  if (
    !isInteger(x) ||
    !isInteger(y) ||
    !isInteger(width) ||
    !isInteger(height) ||
    width < mainWindowMinimumSize.width ||
    height < mainWindowMinimumSize.height
  ) {
    return null
  }

  return {
    version: mainWindowStateSchemaVersion,
    displayMode: value.displayMode,
    normalBounds: { x, y, width, height }
  }
}

export function resolveMainWindowStartupState(input: {
  readonly displays: readonly MainWindowDisplay[]
  readonly persistedState: MainWindowStateSnapshot | null
  readonly policy: MainWindowStartupPolicy
}): MainWindowStartupState {
  const primaryWorkArea = resolvePrimaryWorkArea(input.displays)
  const sourceBounds = input.persistedState?.normalBounds ?? centerDefaultBounds(primaryWorkArea)

  if (input.policy.mode === 'offscreen-inactive') {
    return {
      displayMode: 'normal',
      normalBounds: {
        ...input.policy.position,
        width: sourceBounds.width,
        height: sourceBounds.height
      }
    }
  }

  return {
    displayMode: input.persistedState?.displayMode ?? 'normal',
    normalBounds: isBoundsCoveredByDisplays(sourceBounds, input.displays)
      ? sourceBounds
      : fitBoundsIntoWorkArea(
          sourceBounds,
          resolveTargetWorkArea(sourceBounds, input.displays, primaryWorkArea)
        )
  }
}

function resolvePrimaryWorkArea(displays: readonly MainWindowDisplay[]): MainWindowBounds {
  return (
    displays.find((display) => display.isPrimary)?.workArea ??
    displays[0]?.workArea ?? {
      x: 0,
      y: 0,
      ...mainWindowDefaultSize
    }
  )
}

function centerDefaultBounds(workArea: MainWindowBounds): MainWindowBounds {
  const width = Math.min(mainWindowDefaultSize.width, workArea.width)
  const height = Math.min(mainWindowDefaultSize.height, workArea.height)
  return {
    x: workArea.x + Math.floor((workArea.width - width) / 2),
    y: workArea.y + Math.floor((workArea.height - height) / 2),
    width,
    height
  }
}

function resolveTargetWorkArea(
  bounds: MainWindowBounds,
  displays: readonly MainWindowDisplay[],
  fallback: MainWindowBounds
): MainWindowBounds {
  let bestMatch: { readonly area: number; readonly workArea: MainWindowBounds } | null = null
  for (const display of displays) {
    const area = intersectionArea(bounds, display.workArea)
    if (area <= 0 || (bestMatch && bestMatch.area >= area)) continue
    bestMatch = { area, workArea: display.workArea }
  }
  return bestMatch?.workArea ?? fallback
}

function fitBoundsIntoWorkArea(
  bounds: MainWindowBounds,
  workArea: MainWindowBounds
): MainWindowBounds {
  const width = Math.min(bounds.width, workArea.width)
  const height = Math.min(bounds.height, workArea.height)
  return {
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height
  }
}

function isBoundsCoveredByDisplays(
  bounds: MainWindowBounds,
  displays: readonly MainWindowDisplay[]
): boolean {
  const right = bounds.x + bounds.width
  const bottom = bounds.y + bounds.height
  const horizontalBoundaries = new Set([bounds.x, right])
  for (const { workArea } of displays) {
    const clippedLeft = Math.max(bounds.x, workArea.x)
    const clippedRight = Math.min(right, workArea.x + workArea.width)
    if (clippedLeft >= clippedRight) continue
    horizontalBoundaries.add(clippedLeft)
    horizontalBoundaries.add(clippedRight)
  }
  const sortedBoundaries = [...horizontalBoundaries].sort((first, second) => first - second)

  for (let index = 1; index < sortedBoundaries.length; index += 1) {
    const left = sortedBoundaries[index - 1]!
    const segmentRight = sortedBoundaries[index]!
    if (
      !isVerticalRangeCovered(
        bounds.y,
        bottom,
        displays
          .map(({ workArea }) => workArea)
          .filter((workArea) => workArea.x <= left && workArea.x + workArea.width >= segmentRight)
          .map((workArea): VerticalInterval => [
            Math.max(bounds.y, workArea.y),
            Math.min(bottom, workArea.y + workArea.height)
          ])
      )
    ) {
      return false
    }
  }
  return true
}

function isVerticalRangeCovered(
  top: number,
  bottom: number,
  intervals: readonly VerticalInterval[]
): boolean {
  let coveredUntil = top
  for (const [start, end] of [...intervals].sort((first, second) => first[0] - second[0])) {
    if (end <= coveredUntil) continue
    if (start > coveredUntil) return false
    coveredUntil = end
    if (coveredUntil >= bottom) return true
  }
  return false
}

function intersectionArea(first: MainWindowBounds, second: MainWindowBounds): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
  )
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
  )
  return width * height
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function isMainWindowDisplayMode(value: unknown): value is MainWindowDisplayMode {
  return value === 'normal' || value === 'maximized' || value === 'fullscreen'
}
