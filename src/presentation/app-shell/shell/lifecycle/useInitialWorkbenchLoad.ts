import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'

export type InitialWorkbenchLoadPhase = 'loading' | 'ready' | 'error'

interface UseInitialWorkbenchLoadInput {
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}

interface InitialWorkbenchLoadController {
  readonly phase: InitialWorkbenchLoadPhase
  readonly retry: () => void
}

export function useInitialWorkbenchLoad({
  setCurrentWorkbench,
  setWorkbenches
}: UseInitialWorkbenchLoadInput): InitialWorkbenchLoadController {
  const [requestVersion, setRequestVersion] = useState(0)
  const [phase, setPhase] = useState<InitialWorkbenchLoadPhase>(() =>
    window.cleancode ? 'loading' : 'ready'
  )

  useEffect(() => {
    const api = window.cleancode

    if (!api) {
      return undefined
    }

    let isMounted = true

    void api
      .listWorkbenches()
      .then((rememberedWorkbenches) => {
        if (!isMounted) return

        if (rememberedWorkbenches.length > 0) {
          setWorkbenches((entries) => (entries.length > 0 ? entries : rememberedWorkbenches))
          setCurrentWorkbench(
            (workbench) =>
              workbench ??
              rememberedWorkbenches.find((entry) => entry.isCurrentProject) ??
              rememberedWorkbenches[0] ??
              null
          )
        }

        setPhase('ready')
      })
      .catch(() => {
        if (isMounted) setPhase('error')
      })

    return () => {
      isMounted = false
    }
  }, [requestVersion, setCurrentWorkbench, setWorkbenches])

  const retry = useCallback((): void => {
    if (!window.cleancode) return

    setPhase('loading')
    setRequestVersion((version) => version + 1)
  }, [])

  return { phase, retry }
}
