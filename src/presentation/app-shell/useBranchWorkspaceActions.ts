import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { useI18n } from './i18n/useI18n'
import { manualWorkspaceSelectionBrowserEventName } from './useTerminalWorkspaceSynchronization'
import type { WorkbenchSnapshot } from './types'

interface UseBranchWorkspaceActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly terminateWorkspaceTerminalSessions: (
    workbench: WorkbenchSnapshot,
    workspaceId: string
  ) => Promise<void>
  readonly forgetWorkspaceTerminalStates: (projectId: string, workspaceId: string) => void
}

export function useBranchWorkspaceActions({
  currentWorkbench,
  replaceWorkbench,
  setHoveredTerminalBlockId,
  setSelectedTerminalBlockId,
  terminateWorkspaceTerminalSessions,
  forgetWorkspaceTerminalStates
}: UseBranchWorkspaceActionsInput) {
  const { t } = useI18n()
  const [branchWorkspaceActionError, setBranchWorkspaceActionError] = useState<string | null>(null)
  const clearCurrentBlockSelection = useCallback(() => {
    setSelectedTerminalBlockId(null)
    setHoveredTerminalBlockId(null)
  }, [setHoveredTerminalBlockId, setSelectedTerminalBlockId])
  const dismissBranchWorkspaceActionError = useCallback(() => {
    setBranchWorkspaceActionError(null)
  }, [])

  const selectWorkspace = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceId: string): Promise<void> => {
      if (currentWorkbench?.project.id === workbench.project.id) {
        const selectedWorkspace = currentWorkbench.project.workspaces.find(
          (workspace) => workspace.workspaceId === workspaceId
        )

        if (selectedWorkspace?.isCurrent) {
          return
        }
      }

      const switchedWorkbench = await window.cleancode?.switchBranchWorkspace({
        projectDirectory: workbench.project.directory,
        workspaceId
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
        setBranchWorkspaceActionError(
          resolveUserFacingErrorMessage(error, 'workspace.operationFailed', t)
        )
      }
    },
    [clearCurrentBlockSelection, replaceWorkbench, t]
  )

  const archiveBranchWorkspace = useCallback(
    async (
      workbench: WorkbenchSnapshot,
      workspaceId: string,
      lockedWorktreeConfirmation?: { readonly lockReason: string | null }
    ): Promise<void> => {
      setBranchWorkspaceActionError(null)

      try {
        const selectedWorkspace = currentWorkbench?.project.workspaces.find(
          (workspace) => workspace.workspaceId === workspaceId
        )
        const shouldTerminateCurrentWorkspace =
          currentWorkbench?.project.id === workbench.project.id &&
          Boolean(selectedWorkspace?.isCurrent)

        if (shouldTerminateCurrentWorkspace && currentWorkbench) {
          await terminateWorkspaceTerminalSessions(currentWorkbench, workspaceId)
        }

        const archivedWorkbench = await window.cleancode?.archiveBranchWorkspace({
          projectDirectory: workbench.project.directory,
          workspaceId,
          ...(lockedWorktreeConfirmation ? { lockedWorktreeConfirmation } : {})
        })

        if (archivedWorkbench) {
          forgetWorkspaceTerminalStates(workbench.project.id, workspaceId)
          clearCurrentBlockSelection()
          replaceWorkbench(archivedWorkbench)
        }
      } catch (error) {
        setBranchWorkspaceActionError(
          resolveUserFacingErrorMessage(error, 'workspace.operationFailed', t)
        )
      }
    },
    [
      clearCurrentBlockSelection,
      currentWorkbench,
      replaceWorkbench,
      t,
      terminateWorkspaceTerminalSessions,
      forgetWorkspaceTerminalStates
    ]
  )

  const checkoutMainBranch = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      setBranchWorkspaceActionError(null)

      try {
        const checkedOutWorkbench = await window.cleancode?.checkoutMainWorkspaceBranch({
          projectDirectory: workbench.project.directory,
          branchName
        })

        if (checkedOutWorkbench) {
          replaceWorkbench(checkedOutWorkbench)
        }
      } catch (error) {
        setBranchWorkspaceActionError(
          resolveUserFacingErrorMessage(error, 'workspace.operationFailed', t)
        )
      }
    },
    [replaceWorkbench, t]
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
