import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'

export type CodexCliPanelState =
  | { readonly status: 'unavailable' }
  | { readonly status: 'checking'; readonly visible: boolean }
  | { readonly status: 'ready'; readonly installation: CodexCliInstallationSnapshot }

export interface CodexCliStateController {
  readonly retry: () => void
  readonly state: CodexCliPanelState
}

export const CodexCliStateContext = createContext<CodexCliStateController | null>(null)

const checkingNoticeDelayMs = 400
const automaticRetryDelayMs = 600

export function useCodexCliState(): CodexCliStateController {
  const sharedController = useContext(CodexCliStateContext)
  const localController = useCodexCliInspection(sharedController === null)

  return sharedController ?? localController
}

export function useCodexCliInspection(enabled: boolean): CodexCliStateController {
  const [state, setState] = useState<CodexCliPanelState>(() => createInitialState())
  const generationRef = useRef(0)
  const checkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const retry = useCallback(() => {
    generationRef.current += 1
    const generation = generationRef.current
    clearInspectionTimers(checkingTimerRef, retryTimerRef)

    const inspectCodexCli = window.cleancode?.inspectCodexCli
    if (!inspectCodexCli) {
      setState({ status: 'unavailable' })
      return
    }

    setState({ status: 'checking', visible: false })
    checkingTimerRef.current = setTimeout(() => {
      if (generation !== generationRef.current) return
      setState((current) =>
        current.status === 'checking' ? { status: 'checking', visible: true } : current
      )
    }, checkingNoticeDelayMs)

    const inspect = async (isAutomaticRetry: boolean): Promise<void> => {
      const installation = await inspectCodexCli().catch((): CodexCliInstallationSnapshot => ({
        reason: 'command_failed',
        status: 'temporarily_unavailable',
        version: null
      }))

      if (generation !== generationRef.current) return

      if (!isAutomaticRetry && installation.status !== 'installed') {
        retryTimerRef.current = setTimeout(() => void inspect(true), automaticRetryDelayMs)
        return
      }

      clearInspectionTimers(checkingTimerRef, retryTimerRef)
      setState({ installation, status: 'ready' })
    }

    void inspect(false)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    retry()
    return () => {
      generationRef.current += 1
      clearInspectionTimers(checkingTimerRef, retryTimerRef)
    }
  }, [enabled, retry])

  return useMemo(() => ({ retry, state }), [retry, state])
}

function createInitialState(): CodexCliPanelState {
  return window.cleancode ? { status: 'checking', visible: false } : { status: 'unavailable' }
}

function clearInspectionTimers(
  checkingTimerRef: { current: ReturnType<typeof setTimeout> | null },
  retryTimerRef: { current: ReturnType<typeof setTimeout> | null }
): void {
  if (checkingTimerRef.current !== null) clearTimeout(checkingTimerRef.current)
  if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
  checkingTimerRef.current = null
  retryTimerRef.current = null
}
