import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'

interface UseCurrentGraphStateInput {
  readonly setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>
  readonly setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
  readonly setHoveredTerminalBlockId: Dispatch<SetStateAction<string | null>>
}

export function useCurrentGraphState(input: UseCurrentGraphStateInput) {
  return useCallback((graph: WorkbenchSnapshot['graph']): void => {
    const blockIds = new Set(graph.blocks.map((block) => block.id))
    const groupIds = new Set(graph.terminalGroups.map((group) => group.id))

    input.setSelectedTerminalBlockIds((ids) => ids.filter((blockId) => blockIds.has(blockId)))
    input.setSelectedTerminalGroupId((id) => (id && groupIds.has(id) ? id : null))
    input.setHoveredTerminalBlockId((id) => (id && blockIds.has(id) ? id : null))
    input.setCurrentWorkbench((workbench) => (workbench ? { ...workbench, graph } : workbench))
    input.setWorkbenches((entries) =>
      entries.map((entry) => (entry.project.id === graph.projectId ? { ...entry, graph } : entry))
    )
  }, [])
}
