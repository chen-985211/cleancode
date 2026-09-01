import { useMemo } from 'react'

import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'

export function useBlockGraphIndex(graph: BlockGraphSnapshot | null) {
  const terminalBlocksById = useMemo(
    () => new Map((graph?.blocks ?? []).map((block) => [block.id, block])),
    [graph]
  )
  const terminalGroupsById = useMemo(
    () => new Map((graph?.terminalGroups ?? []).map((group) => [group.id, group])),
    [graph]
  )

  return { terminalBlocksById, terminalGroupsById }
}
