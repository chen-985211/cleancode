import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { manualWorkspaceSelectionBrowserEventName } from './useTerminalWorkspaceSynchronization'
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
  const [branchWorkspaceActionError, setBranchWorkspaceActionError] = useState<string | null>(null)
  const clearCurrentBlockSelection = useCallback(() => {
    setSelectedTerminalBlockId(null)
    setHoveredTerminalBlockId(null)
  }, [setHoveredTerminalBlockId, setSelectedTerminalBlockId])
  const dismissBranchWorkspaceActionError = useCallback(() => {
    setBranchWorkspaceActionError(null)
  }, [])

  const selectWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceName: string): Promise<void> => {
      if (currentWorkbench?.project.id === workbench.project.id) {
        const selectedWorkspace = currentWorkbench.project.workspaces.find(
          (workspace) => workspace.name === workspaceName
        )

        if (selectedWorkspace?.isCurrent) {
          return
        }
      }

      const switchedWorkbench = await window.cleancode?.switchBranchWorkspace({
        projectDirectory: workbench.project.directory,
        workspaceName
      })

      if (switchedWorkbench) {
        window.dispatchEvent(new CustomEvent(manualWorkspaceSelectionBrowserEventName))
        clearCurrentBlockSelection()
        replaceWorkbench(switchedWorkbench)
      }
    },
    [clearCurrentBlockSelection, currentWorkbench, replaceWorkbench]
  )

  const createBranchWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      setBranchWorkspaceActionError(null)

      try {
        const createdWorkbench = await window.cleancode?.createBranchWorkspace({
          projectDirectory: workbench.project.directory,
          branchName
        })

        if (!createdWorkbench) {
          return
        }

        clearCurrentBlockSelection()
        replaceWorkbench(createdWorkbench)
      } catch (error) {
        setBranchWorkspaceActionError(resolveUserFacingErrorMessage(error, '工作区操作失败。'))
      }
    },
    [clearCurrentBlockSelection, replaceWorkbench]
  )

  const archiveBranchWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceName: string): Promise<void> => {
      setBranchWorkspaceActionError(null)

      try {
        const selectedWorkspace = currentWorkbench?.project.workspaces.find(
          (workspace) => workspace.name === workspaceName
        )
        const shouldTerminateCurrentWorkspace =
          currentWorkbench?.project.id === workbench.project.id &&
          Boolean(selectedWorkspace?.isCurrent)

        if (shouldTerminateCurrentWorkspace && currentWorkbench) {
          await terminateWorkbenchTerminalSessions(currentWorkbench)
        }

        const archivedWorkbench = await window.cleancode?.archiveBranchWorkspace({
          projectDirectory: workbench.project.directory,
          workspaceName
        })

        if (archivedWorkbench) {
          clearCurrentBlockSelection()
          replaceWorkbench(archivedWorkbench)
        }
      } catch (error) {
        setBranchWorkspaceActionError(resolveUserFacingErrorMessage(error, '工作区操作失败。'))
      }
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
      const checkedOutWorkbench = await window.cleancode?.checkoutMainWorkspaceBranch({
        projectDirectory: workbench.project.directory,
        branchName
      })

      if (checkedOutWorkbench) {
        clearCurrentBlockSelection()
        replaceWorkbench(checkedOutWorkbench)
      }
    },
    [clearCurrentBlockSelection, replaceWorkbench]
  )

  return {
    archiveBranchWorkspace,
    branchWorkspaceActionError,
    checkoutMainBranch,
    createBranchWorkspace,
    dismissBranchWorkspaceActionError,
    selectWorkspace
  }
}
