import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { useI18n } from './i18n/useI18n'
import type { WorkbenchSnapshot } from './types'
import { resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'

interface UseProjectActionsInput {
  readonly rememberWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
  readonly terminateWorkbenchTerminalSessions: (workbench: WorkbenchSnapshot) => Promise<void>
}

export function useProjectActions({
  rememberWorkbench,
  setCurrentWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setWorkbenches,
  terminateWorkbenchTerminalSessions
}: UseProjectActionsInput) {
  const { t } = useI18n()
  const [projectActionError, setProjectActionError] = useState<string | null>(null)
  const [isReorderingProject, setIsReorderingProject] = useState(false)
  const isReorderingProjectRef = useRef(false)
  const addProject = useCallback(async () => {
    const workbench = await window.cleancode?.addProject()

    if (workbench) {
      rememberWorkbench(workbench)
    }
  }, [rememberWorkbench])

  const removeProject = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      await terminateWorkbenchTerminalSessions(workbench)

      const rememberedWorkbenches = await window.cleancode?.removeProject({
        projectDirectory: workbench.project.directory
      })

      if (!rememberedWorkbenches) return

      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
      setHoveredTerminalBlockId(null)
      setWorkbenches(rememberedWorkbenches)
      setCurrentWorkbench((current) =>
        resolveCurrentWorkbenchAfterRemoval(current, workbench, rememberedWorkbenches)
      )
    },
    [
      setCurrentWorkbench,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      setWorkbenches,
      terminateWorkbenchTerminalSessions
    ]
  )

  const reorderProject = useCallback(
    async (workbench: WorkbenchSnapshot, beforeProjectDirectory: string | null): Promise<void> => {
      if (isReorderingProjectRef.current) {
        return
      }

      isReorderingProjectRef.current = true
      setIsReorderingProject(true)
      setProjectActionError(null)

      try {
        const reorderedWorkbenches = await window.cleancode?.reorderProject({
          projectDirectory: workbench.project.directory,
          beforeProjectDirectory
        })

        if (!reorderedWorkbenches) {
          return
        }

        setWorkbenches(reorderedWorkbenches)
        setCurrentWorkbench((current) =>
          current
            ? (reorderedWorkbenches.find(
                (entry) => entry.project.directory === current.project.directory
              ) ?? current)
            : null
        )
      } catch (error) {
        setProjectActionError(resolveUserFacingErrorMessage(error, 'sidebar.reorderFailed', t))
      } finally {
        isReorderingProjectRef.current = false
        setIsReorderingProject(false)
      }
    },
    [setCurrentWorkbench, setWorkbenches, t]
  )

  const dismissProjectActionError = useCallback(() => {
    setProjectActionError(null)
  }, [])

  return {
    addProject,
    dismissProjectActionError,
    isReorderingProject,
    projectActionError,
    removeProject,
    reorderProject
  }
}
