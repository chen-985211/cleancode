import { useEffect, useRef } from 'react'

import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'

const projectGitStateSynchronizationIntervalMs = 1500

interface UseProjectGitStateSynchronizationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
}

export function useProjectGitStateSynchronization({
  currentWorkbench,
  replaceWorkbench
}: UseProjectGitStateSynchronizationInput): void {
  const latestWorkbenchRef = useRef(currentWorkbench)
  latestWorkbenchRef.current = currentWorkbench

  useEffect(() => {
    const api = window.cleancode
    const projectDirectory = currentWorkbench?.project.directory

    if (!api?.synchronizeProjectGitState || !projectDirectory) {
      return undefined
    }

    let isDisposed = false
    let isSynchronizing = false

    const synchronizeProjectGitState = async (): Promise<void> => {
      if (isSynchronizing) {
        return
      }

      isSynchronizing = true
      const workbenchAtRequestStart = latestWorkbenchRef.current

      try {
        const synchronizedWorkbench = await api.synchronizeProjectGitState({ projectDirectory })

        if (
          !isDisposed &&
          synchronizedWorkbench &&
          latestWorkbenchRef.current === workbenchAtRequestStart
        ) {
          replaceWorkbench(synchronizedWorkbench)
        }
      } catch {
        // IPC failure is already logged in the main process; keep the last valid workbench.
      } finally {
        isSynchronizing = false
      }
    }

    void synchronizeProjectGitState()
    const intervalId = window.setInterval(
      () => void synchronizeProjectGitState(),
      projectGitStateSynchronizationIntervalMs
    )
    const handleWindowFocus = (): void => {
      void synchronizeProjectGitState()
    }

    window.addEventListener('focus', handleWindowFocus)

    return () => {
      isDisposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [currentWorkbench?.project.directory, replaceWorkbench])
}
