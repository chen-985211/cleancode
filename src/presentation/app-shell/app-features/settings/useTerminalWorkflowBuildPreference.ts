import { useCallback, useState } from 'react'

import {
  readTerminalWorkflowBuildPreference,
  writeTerminalWorkflowBuildPreference,
  type TerminalWorkflowBuildMode
} from './terminalWorkflowBuildPreference'

export function useTerminalWorkflowBuildPreference() {
  const [preference, setPreference] = useState(readTerminalWorkflowBuildPreference)

  const changeTerminalWorkflowBuildMode = useCallback((mode: TerminalWorkflowBuildMode): void => {
    const next = { mode }
    try {
      writeTerminalWorkflowBuildPreference(next)
    } catch {
      // Storage is best effort; subsequent workflow builds still use the selected mode.
    }
    setPreference(next)
  }, [])

  return {
    changeTerminalWorkflowBuildMode,
    terminalWorkflowBuildMode: preference.mode
  }
}
