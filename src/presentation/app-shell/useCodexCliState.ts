import { useEffect, useState } from 'react'

import type { CodexCliPanelState } from './CodexCliStatusView'

export function useCodexCliState(): CodexCliPanelState {
  const [state, setState] = useState<CodexCliPanelState>(() =>
    window.cleancode ? { status: 'checking' } : { status: 'unavailable' }
  )

  useEffect(() => {
    let isCurrent = true

    async function inspect(): Promise<void> {
      const api = window.cleancode
      if (!api?.inspectCodexCli) {
        setState({ status: 'unavailable' })
        return
      }

      setState({ status: 'checking' })
      const installation = await api.inspectCodexCli()
      if (isCurrent) setState({ installation, status: 'ready' })
    }

    void inspect()
    return () => {
      isCurrent = false
    }
  }, [])

  return state
}
