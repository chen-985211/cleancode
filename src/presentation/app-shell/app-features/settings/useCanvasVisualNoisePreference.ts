import { useCallback, useState } from 'react'

import {
  readCanvasVisualNoisePreference,
  writeCanvasVisualNoisePreference
} from './canvasVisualNoisePreference'

export function useCanvasVisualNoisePreference() {
  const [preference, setPreference] = useState(readCanvasVisualNoisePreference)

  const changeReduceVisualNoise = useCallback((reduceVisualNoise: boolean): void => {
    const next = { reduceVisualNoise }
    try {
      writeCanvasVisualNoisePreference(next)
    } catch {
      // Storage is best effort; the current canvas still reflects the selected preference.
    }
    setPreference(next)
  }, [])

  return {
    changeReduceVisualNoise,
    reduceVisualNoise: preference.reduceVisualNoise
  }
}
