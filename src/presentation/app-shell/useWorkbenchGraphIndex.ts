import { useBlockGraphIndex } from '../../contexts/block-graph/presentation/view-models/useBlockGraphIndex'
import { findCurrentWorkspace } from './findCurrentWorkspace'
import type { WorkbenchSnapshot } from './types'

export function useWorkbenchGraphIndex(currentWorkbench: WorkbenchSnapshot | null) {
  const graph = currentWorkbench?.graph ?? null
  const currentWorkspace = findCurrentWorkspace(currentWorkbench)
  const { terminalBlocksById, terminalGroupsById } = useBlockGraphIndex(graph)

  return { currentWorkspace, graph, terminalBlocksById, terminalGroupsById }
}
