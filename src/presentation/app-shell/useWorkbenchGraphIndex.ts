import { useMemo } from 'react'

import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { WorkbenchSnapshot } from './types'

export function useWorkbenchGraphIndex(currentWorkbench: WorkbenchSnapshot | null) {
  const graph = currentWorkbench?.graph ?? null
  const currentWorkspace = findCurrentWorkspace(currentWorkbench)
  const terminalBlocksById = useMemo(
    () => new Map((graph?.blocks ?? []).map((block) => [block.id, block])),
    [graph]
  )
  const terminalGroupsById = useMemo(
    () => new Map((graph?.terminalGroups ?? []).map((group) => [group.id, group])),
    [graph]
  )

  return { currentWorkspace, graph, terminalBlocksById, terminalGroupsById }
}
