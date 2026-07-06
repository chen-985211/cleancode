import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'

interface UseBranchWorkspaceActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly terminateWorkbenchTerminalSessions: (workbench: WorkbenchSnapshot) => Promise<void>
}

export function useBranchWorkspaceActions({
  currentWorkbench,
  replaceWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockId,
  terminateWorkbenchTerminalSessions
}: UseBranchWorkspaceActionsInput) {
  const clearCurrentBlockSelection = useCallback(() => {
    setSelectedTerminalBlockId(null)
    setHoveredTerminalBlockId(null)
  }, [setHoveredTerminalBlockId, setSelectedTerminalBlockId])

  const selectWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceName: string): Promise<void> => {
      if (currentWorkbench?.project.id === workbench.project.id) {
        const selectedWorkspace = currentWorkbench.project.workspaces.find(
          (workspace) => workspace.name === workspaceName
        )

        if (selectedWorkspace?.isCurrent) {
          return
        }

        await terminateWorkbenchTerminalSessions(currentWorkbench)
      }

      const switchedWorkbench = await window.cleancode?.switchBranchWorkspace({
        projectDirectory: workbench.project.directory,
        workspaceName
      })

      if (switchedWorkbench) {
        clearCurrentBlockSelection()
        replaceWorkbench(switchedWorkbench)
      }
    },
    [
      clearCurrentBlockSelection,
      currentWorkbench,
      replaceWorkbench,
      terminateWorkbenchTerminalSessions
    ]
  )

  const createBranchWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      const createdWorkbench = await window.cleancode?.createBranchWorkspace({
        projectDirectory: workbench.project.directory,
        branchName
      })

      if (!createdWorkbench) {
        return
      }

      if (currentWorkbench?.project.id === workbench.project.id) {
        await terminateWorkbenchTerminalSessions(currentWorkbench)
      }

      clearCurrentBlockSelection()
      replaceWorkbench(createdWorkbench)
    },
    [
      clearCurrentBlockSelection,
      currentWorkbench,
      replaceWorkbench,
      terminateWorkbenchTerminalSessions
    ]
  )

  const checkoutMainBranch = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      if (currentWorkbench?.project.id === workbench.project.id) {
        await terminateWorkbenchTerminalSessions(currentWorkbench)
      }

      const checkedOutWorkbench = await window.cleancode?.checkoutMainWorkspaceBranch({
        projectDirectory: workbench.project.directory,
        branchName
      })

      if (checkedOutWorkbench) {
        clearCurrentBlockSelection()
        replaceWorkbench(checkedOutWorkbench)
      }
    },
    [
      clearCurrentBlockSelection,
      currentWorkbench,
      replaceWorkbench,
      terminateWorkbenchTerminalSessions
    ]
  )

  return { checkoutMainBranch, createBranchWorkspace, selectWorkspace }
}
