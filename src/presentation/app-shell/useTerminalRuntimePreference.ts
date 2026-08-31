import { useCallback, useEffect, useState } from 'react'

import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import {
  readTerminalRuntimePreference,
  writeTerminalRuntimePreference
} from '../../contexts/run/presentation/view-models/terminalRuntimePreference'
import type { TerminalSurfaceRegistry } from './terminalSurfaceRegistry'

export function useTerminalRuntimePreference(surfaceRegistry: TerminalSurfaceRegistry) {
  const [preference, setPreference] = useState(readTerminalRuntimePreference)

  useEffect(() => {
    surfaceRegistry.setScrollbackRows(preference.scrollbackRows)
    const updateTerminalScrollback = window.cleancode?.updateTerminalScrollback
    if (typeof updateTerminalScrollback !== 'function') return
    void updateTerminalScrollback({ scrollbackRows: preference.scrollbackRows }).catch(
      () => undefined
    )
  }, [preference.scrollbackRows, surfaceRegistry])

  const changeTerminalScrollback = useCallback((scrollbackRows: TerminalScrollbackRows): void => {
    const next = { scrollbackRows }
    try {
      writeTerminalRuntimePreference(next)
    } catch {
      // Storage is best effort; the active runtime still uses the new budget.
    }
    setPreference(next)
  }, [])

  return { changeTerminalScrollback, terminalScrollbackRows: preference.scrollbackRows }
}
