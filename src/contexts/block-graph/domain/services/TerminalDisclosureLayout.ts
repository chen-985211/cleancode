import { terminalExpansionSize } from './TerminalExpansionSize'
import type {
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import { layoutTerminalGroupMembers } from './TerminalGroupMemberLayout'
import { expandTerminalGroupMemberIdsToCompleteWorkflows } from './TerminalGroupRules'
import { createTerminalFlowRowLayouts } from './TerminalDependencyLayout'

export function reflowTerminalDisclosure(
  blockId: string,
  blocks: readonly TerminalBlockSnapshot[],
  groups: readonly TerminalGroupSnapshot[],
  connections: readonly TerminalConnectionSnapshot[]
): { readonly blocks: TerminalBlockSnapshot[]; readonly groups: TerminalGroupSnapshot[] } {
  const group = groups.find((candidate) => candidate.memberBlockIds.includes(blockId))
  if (group) {
    const layout = layoutTerminalGroupMembers(group, blocks, connections)
    return {
      blocks: layout.blocks,
      groups: groups.map((candidate) => (candidate.id === group.id ? layout.group : candidate))
    }
  }

  const groupedIds = new Set(groups.flatMap((candidate) => candidate.memberBlockIds))
  const freeBlocks = blocks.filter((block) => !groupedIds.has(block.id))
  const freeIds = new Set(freeBlocks.map((block) => block.id))
  const freeConnections = connections.filter(
    (connection) => freeIds.has(connection.sourceBlockId) && freeIds.has(connection.targetBlockId)
  )
  const scopeIds = new Set(
    expandTerminalGroupMemberIdsToCompleteWorkflows(freeBlocks, freeConnections, [blockId])
  )
  const scope = freeBlocks.filter((block) => scopeIds.has(block.id))
  const anchor = {
    x: Math.min(...scope.map((block) => block.position.x)),
    y: Math.min(...scope.map((block) => block.position.y))
  }
  const positions = new Map(
    createTerminalFlowRowLayouts(scope, freeConnections).map((layout) => [
      layout.blockId,
      { x: anchor.x + layout.position.x, y: anchor.y + layout.position.y }
    ])
  )
  return {
    blocks: blocks.map((block) => {
      const position = positions.get(block.id)
      return position ? { ...block, position } : block
    }),
    groups: [...groups]
  }
}

export function expandTerminalGroupLayout(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[]
) {
  const members = new Set(group.memberBlockIds)
  const next = blocks.map((block) =>
    members.has(block.id) && !block.isCollapsed
      ? { ...block, size: terminalExpansionSize(block, connections) }
      : block
  )
  return layoutTerminalGroupMembers(group, next, connections)
}
