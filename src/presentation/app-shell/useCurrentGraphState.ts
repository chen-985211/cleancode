import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'

interface UseCurrentGraphStateInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
}

export function useCurrentGraphState({
  currentWorkbench,
  setCurrentWorkbench,
  setWorkbenches,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setHoveredTerminalBlockId
}: UseCurrentGraphStateInput) {
  useEffect(() => {
    const graph = currentWorkbench?.graph

    if (!graph) {
      return
    }

    const blockIds = new Set(graph.blocks.map((block) => block.id))
    const groupIds = new Set(graph.terminalGroups.map((group) => group.id))

    setSelectedTerminalBlockIds((ids) => ids.filter((blockId) => blockIds.has(blockId)))
    setSelectedTerminalGroupId((id) => (id && groupIds.has(id) ? id : null))
    setHoveredTerminalBlockId((id) => (id && blockIds.has(id) ? id : null))
  }, [
    currentWorkbench?.graph,
    setHoveredTerminalBlockId,
    setSelectedTerminalBlockIds,
    setSelectedTerminalGroupId
  ])

  return useCallback(
    (graph: WorkbenchSnapshot['graph']): void => {
      setCurrentWorkbench((workbench) => replaceOwnedGraph(workbench, graph))
      setWorkbenches((entries) => entries.map((entry) => replaceOwnedGraph(entry, graph)))
    },
    [setCurrentWorkbench, setWorkbenches]
  )
}

function replaceOwnedGraph(
  workbench: WorkbenchSnapshot,
  graph: WorkbenchSnapshot['graph']
): WorkbenchSnapshot
function replaceOwnedGraph(
  workbench: WorkbenchSnapshot | null,
  graph: WorkbenchSnapshot['graph']
): WorkbenchSnapshot | null
function replaceOwnedGraph(
  workbench: WorkbenchSnapshot | null,
  graph: WorkbenchSnapshot['graph']
): WorkbenchSnapshot | null {
  if (!workbench || workbench.project.id !== graph.projectId) {
    return workbench
  }

  const currentWorkspace = workbench.project.workspaces.find((workspace) => workspace.isCurrent)

  return currentWorkspace?.name === graph.workspaceName ? { ...workbench, graph } : workbench
}
