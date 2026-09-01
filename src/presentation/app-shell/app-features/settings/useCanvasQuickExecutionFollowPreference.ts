import { useCallback, useState } from 'react'

import {
  readCanvasQuickExecutionFollowPreference,
  writeCanvasQuickExecutionFollowPreference
} from './canvasQuickExecutionFollowPreference'

export function useCanvasQuickExecutionFollowPreference() {
  const [preference, setPreference] = useState(readCanvasQuickExecutionFollowPreference)

  const changeFollowQuickExecutionTarget = useCallback(
    (followQuickExecutionTarget: boolean): void => {
      const next = { followQuickExecutionTarget }
      try {
        writeCanvasQuickExecutionFollowPreference(next)
      } catch {
        // Storage is best effort; the current canvas still reflects the selected preference.
      }
      setPreference(next)
    },
    []
  )

  return {
    changeFollowQuickExecutionTarget,
    followQuickExecutionTarget: preference.followQuickExecutionTarget
  }
}
