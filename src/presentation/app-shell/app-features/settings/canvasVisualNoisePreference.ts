const canvasVisualNoisePreferenceStorageKey = 'cleancode.canvas-visual-noise-preference'

export const defaultReduceCanvasVisualNoise = true

export interface CanvasVisualNoisePreference {
  readonly reduceVisualNoise: boolean
}

export function readCanvasVisualNoisePreference(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): CanvasVisualNoisePreference {
  const stored = storage.getItem(canvasVisualNoisePreferenceStorageKey)
  if (stored === null) return { reduceVisualNoise: defaultReduceCanvasVisualNoise }

  try {
    const value = JSON.parse(stored) as {
      readonly reduceVisualNoise?: unknown
      readonly version?: unknown
    }

    return value.version === 1 && typeof value.reduceVisualNoise === 'boolean'
      ? { reduceVisualNoise: value.reduceVisualNoise }
      : { reduceVisualNoise: defaultReduceCanvasVisualNoise }
  } catch {
    return { reduceVisualNoise: defaultReduceCanvasVisualNoise }
  }
}

export function writeCanvasVisualNoisePreference(
  preference: CanvasVisualNoisePreference,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  storage.setItem(
    canvasVisualNoisePreferenceStorageKey,
    JSON.stringify({ reduceVisualNoise: preference.reduceVisualNoise, version: 1 })
  )
}
