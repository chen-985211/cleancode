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

  const targetWorkArea = resolveTargetWorkArea(sourceBounds, input.displays, primaryWorkArea)
  return {
    displayMode: input.persistedState?.displayMode ?? 'normal',
    normalBounds: fitBoundsIntoWorkArea(sourceBounds, targetWorkArea)
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
