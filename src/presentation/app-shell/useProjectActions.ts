import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'
import { resolveCurrentWorkbenchAfterRemoval } from './workbenchListUpdates'
import type { AgentTerminalSurfaceRegistry } from './agentTerminalSurfaceRegistry'

interface UseProjectActionsInput {
  readonly agentTerminalSurfaceRegistry: AgentTerminalSurfaceRegistry
  readonly rememberWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
  readonly terminateWorkbenchTerminalSessions: (workbench: WorkbenchSnapshot) => Promise<void>
}

export function useProjectActions({
  agentTerminalSurfaceRegistry,
  rememberWorkbench,
  setCurrentWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setWorkbenches,
  terminateWorkbenchTerminalSessions
}: UseProjectActionsInput) {
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

      agentTerminalSurfaceRegistry.releaseProject(workbench.project.id)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(null)
      setHoveredTerminalBlockId(null)
      setWorkbenches(rememberedWorkbenches)
      setCurrentWorkbench((current) =>
        resolveCurrentWorkbenchAfterRemoval(current, workbench, rememberedWorkbenches)
      )
    },
    [
      agentTerminalSurfaceRegistry,
      setCurrentWorkbench,
      setHoveredTerminalBlockId,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      setWorkbenches,
      terminateWorkbenchTerminalSessions
    ]
  )

  return { addProject, removeProject }
}
