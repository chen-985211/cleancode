import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

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
      setBranchWorkspaceActionError(null)

      try {
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
      } catch (error) {
        setBranchWorkspaceActionError(resolveBranchWorkspaceActionErrorMessage(error))
      }
    },
    [
      clearCurrentBlockSelection,
      currentWorkbench,
      replaceWorkbench,
      terminateWorkbenchTerminalSessions
    ]
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
        setBranchWorkspaceActionError(resolveBranchWorkspaceActionErrorMessage(error))
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

  return {
    archiveBranchWorkspace,
    branchWorkspaceActionError,
    checkoutMainBranch,
    createBranchWorkspace,
    dismissBranchWorkspaceActionError,
    selectWorkspace
  }
}

function resolveBranchWorkspaceActionErrorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    (error.message.includes('Git branch already exists') ||
      error.message.includes('Branch workspace already exists'))
  ) {
    return 'Git 分支已存在，无法创建同名工作区。'
  }

  if (error instanceof Error && error.message.includes('uncommitted changes')) {
    return '工作区有未提交更改，无法归档。'
  }

  return error instanceof Error ? error.message : '工作区操作失败。'
}
