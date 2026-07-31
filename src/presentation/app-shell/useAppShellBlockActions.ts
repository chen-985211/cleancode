import { useCallback } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchSnapshot } from './types'

interface UseAppShellBlockActionsInput {
  readonly canCreateTerminalGroup: boolean
  readonly completeTerminalGroupSelection: () => void
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly defaultGroupName: string
  readonly firstGroupName: string
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
  readonly terminateTerminalSession: (block: TerminalBlockSnapshot) => Promise<void>
}

export function useAppShellBlockActions({
  canCreateTerminalGroup,
  completeTerminalGroupSelection,
  currentWorkbench,
  currentWorkspace,
  defaultGroupName,
  firstGroupName,
  selectedUngroupedTerminalBlockIds,
  setCurrentGraph,
  setSelectedTerminalGroupId,
  terminateTerminalSession
}: UseAppShellBlockActionsInput) {
  const createTerminalGroup = useCallback(async () => {
    if (!currentWorkbench || !currentWorkspace || !canCreateTerminalGroup) return

    const existingGroupIds = new Set(currentWorkbench.graph.terminalGroups.map((group) => group.id))
    const graphSnapshot = await window.cleancode?.createTerminalGroup({
      projectDirectory: currentWorkbench.project.directory,
      workspaceId: currentWorkspace.workspaceId,
      name: currentWorkbench.graph.terminalGroups.length === 0 ? firstGroupName : defaultGroupName,
      memberBlockIds: selectedUngroupedTerminalBlockIds
    })

    if (!graphSnapshot) return

    setCurrentGraph(graphSnapshot)
    completeTerminalGroupSelection()
    setSelectedTerminalGroupId(
      graphSnapshot.terminalGroups.find((group) => !existingGroupIds.has(group.id))?.id ?? null
    )
  }, [
    canCreateTerminalGroup,
    completeTerminalGroupSelection,
    currentWorkbench,
    currentWorkspace,
    defaultGroupName,
    firstGroupName,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setSelectedTerminalGroupId
  ])

  const deleteTerminalBlock = useCallback(
    async (block: TerminalBlockSnapshot) => {
      if (!currentWorkbench || !currentWorkspace) return

      await terminateTerminalSession(block)
      const graphSnapshot = await window.cleancode?.deleteBlock({
        projectDirectory: currentWorkbench.project.directory,
        workspaceId: currentWorkspace.workspaceId,
        blockId: block.id
      })

      if (graphSnapshot) setCurrentGraph(graphSnapshot)
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph, terminateTerminalSession]
  )

  return { createTerminalGroup, deleteTerminalBlock }
}
