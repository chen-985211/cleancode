const canvasQuickExecutionFollowPreferenceStorageKey =
  'cleancode.canvas-quick-execution-follow-preference'

export const defaultFollowQuickExecutionTarget = true

export interface CanvasQuickExecutionFollowPreference {
  readonly followQuickExecutionTarget: boolean
}

export function readCanvasQuickExecutionFollowPreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): CanvasQuickExecutionFollowPreference {
  const stored = storage.getItem(canvasQuickExecutionFollowPreferenceStorageKey)
  if (stored === null) {
    return { followQuickExecutionTarget: defaultFollowQuickExecutionTarget }
  }

  try {
    const value = JSON.parse(stored) as {
      readonly followQuickExecutionTarget?: unknown
      readonly version?: unknown
    }

    return value.version === 1 && typeof value.followQuickExecutionTarget === 'boolean'
      ? { followQuickExecutionTarget: value.followQuickExecutionTarget }
      : { followQuickExecutionTarget: defaultFollowQuickExecutionTarget }
  } catch {
    return { followQuickExecutionTarget: defaultFollowQuickExecutionTarget }
  }
}

export function writeCanvasQuickExecutionFollowPreference(
  preference: CanvasQuickExecutionFollowPreference,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(
    canvasQuickExecutionFollowPreferenceStorageKey,
    JSON.stringify({
      followQuickExecutionTarget: preference.followQuickExecutionTarget,
      version: 1
    })
  )
}
