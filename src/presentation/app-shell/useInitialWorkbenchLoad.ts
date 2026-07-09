import { useEffect, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'

interface UseInitialWorkbenchLoadInput {
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
}

export function useInitialWorkbenchLoad({
  setCurrentWorkbench,
  setWorkbenches
}: UseInitialWorkbenchLoadInput): void {
  useEffect(() => {
    const api = window.cleancode

    if (!api) {
      return undefined
    }

    let isMounted = true

    void api.listWorkbenches().then((rememberedWorkbenches) => {
      if (!isMounted || rememberedWorkbenches.length === 0) {
        return
      }

      setWorkbenches((entries) => (entries.length > 0 ? entries : rememberedWorkbenches))
      setCurrentWorkbench((workbench) => workbench ?? rememberedWorkbenches[0] ?? null)
    })

    return () => {
      isMounted = false
    }
  }, [setCurrentWorkbench, setWorkbenches])
}
