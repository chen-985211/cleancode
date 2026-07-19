import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { useI18n } from './i18n/useI18n'
import { manualWorkspaceSelectionBrowserEventName } from './useTerminalWorkspaceSynchronization'
import type { WorkbenchSnapshot } from './types'
import type { AgentTerminalSurfaceRegistry } from './agentTerminalSurfaceRegistry'

interface UseBranchWorkspaceActionsInput {
  readonly agentTerminalSurfaceRegistry: AgentTerminalSurfaceRegistry
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly setSelectedTerminalBlockId: Dispatch<SetStateAction<string | null>>
  readonly terminateWorkspaceTerminalSessions: (
    workbench: WorkbenchSnapshot,
    workspaceName: string
  ) => Promise<void>
  readonly forgetWorkspaceTerminalStates: (projectId: string, workspaceName: string) => void
}

export function useBranchWorkspaceActions({
  agentTerminalSurfaceRegistry,
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
      workspaceName: string,
      lockedWorktreeConfirmation?: { readonly lockReason: string | null }
    ): Promise<void> => {
      setBranchWorkspaceActionError(null)

      try {
        const selectedWorkspace = currentWorkbench?.project.workspaces.find(
          (workspace) => workspace.name === workspaceName
        )
        const shouldTerminateCurrentWorkspace =
          currentWorkbench?.project.id === workbench.project.id &&
          Boolean(selectedWorkspace?.isCurrent)

        if (shouldTerminateCurrentWorkspace && currentWorkbench) {
          await terminateWorkspaceTerminalSessions(currentWorkbench, workspaceName)
        }

        const archivedWorkbench = await window.cleancode?.archiveBranchWorkspace({
          projectDirectory: workbench.project.directory,
          workspaceName,
          ...(lockedWorktreeConfirmation ? { lockedWorktreeConfirmation } : {})
        })

        if (archivedWorkbench) {
          agentTerminalSurfaceRegistry.releaseWorkspace(workbench.project.id, workspaceName)
          forgetWorkspaceTerminalStates(workbench.project.id, workspaceName)
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
      agentTerminalSurfaceRegistry,
      replaceWorkbench,
      t,
      terminateWorkspaceTerminalSessions,
      forgetWorkspaceTerminalStates
    ]
  )

  const checkoutMainBranch = useCallback(
    async (workbench: WorkbenchSnapshot, branchName: string): Promise<void> => {
      const checkedOutWorkbench = await window.cleancode?.checkoutMainWorkspaceBranch({
        projectDirectory: workbench.project.directory,
        branchName
      })

      if (checkedOutWorkbench) {
        agentTerminalSurfaceRegistry.releaseWorkspace(workbench.project.id, 'main')
        forgetWorkspaceTerminalStates(workbench.project.id, 'main')
        clearCurrentBlockSelection()
        replaceWorkbench(checkedOutWorkbench)
      }
    },
    [
      agentTerminalSurfaceRegistry,
      clearCurrentBlockSelection,
      forgetWorkspaceTerminalStates,
      replaceWorkbench
    ]
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
