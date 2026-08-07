import type {
  BlockPositionSnapshot,
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import { normalizeTerminalGroupBounds, terminalGroupPadding } from './TerminalGroupRules'
import { createBalancedTerminalBlockLayouts } from './TerminalLayoutPolicy'

interface ApplyTerminalGroupMembershipMoveInput {
  readonly blockId: string
  readonly blocks: readonly TerminalBlockSnapshot[]
  readonly connections: readonly TerminalConnectionSnapshot[]
  readonly groups: readonly TerminalGroupSnapshot[]
  readonly movedBlockIds: ReadonlySet<string>
  readonly position?: BlockPositionSnapshot
  readonly sourceTerminalGroupId: string | null
  readonly targetTerminalGroupId: string | null
}

interface TerminalGroupMembershipMoveResult {
  readonly blocks: TerminalBlockSnapshot[]
  readonly groups: TerminalGroupSnapshot[]
}

interface TerminalGroupMemberLayoutResult {
  readonly blocks: TerminalBlockSnapshot[]
  readonly group: TerminalGroupSnapshot
}

export function applyTerminalGroupMembershipMove({
  blockId,
  blocks,
  connections,
  groups,
  movedBlockIds,
  position,
  sourceTerminalGroupId,
  targetTerminalGroupId
}: ApplyTerminalGroupMembershipMoveInput): TerminalGroupMembershipMoveResult {
  if (sourceTerminalGroupId === targetTerminalGroupId) {
    const positionedBlocks = position
      ? blocks.map((block) => (block.id === blockId ? { ...block, position } : block))
      : [...blocks]

    return {
      blocks: positionedBlocks,
      groups: normalizeGroupsContainingAnyBlock(groups, positionedBlocks, movedBlockIds)
    }
  }

  let nextBlocks = targetTerminalGroupId
    ? [...blocks]
    : position
      ? moveTerminalWorkflowToPosition(blocks, movedBlockIds, blockId, position)
      : [...blocks]
  let nextGroups = groups.map((group) => {
    const retainedMemberIds = group.memberBlockIds.filter((id) => !movedBlockIds.has(id))
    const memberBlockIds =
      group.id === targetTerminalGroupId
        ? [
            ...retainedMemberIds,
            ...blocks.map((block) => block.id).filter((id) => movedBlockIds.has(id))
          ]
        : retainedMemberIds

    return memberBlockIds.length === group.memberBlockIds.length
      ? group
      : { ...group, memberBlockIds }
  })

  const affectedGroupIds = new Set(
    [sourceTerminalGroupId, targetTerminalGroupId].filter(
      (groupId): groupId is string => groupId !== null
    )
  )
  for (const groupId of affectedGroupIds) {
    const group = nextGroups.find((candidate) => candidate.id === groupId)
    if (!group) continue
    const layout = layoutTerminalGroupMembers(group, nextBlocks, connections)
    nextBlocks = layout.blocks
    nextGroups = nextGroups.map((candidate) =>
      candidate.id === groupId ? layout.group : candidate
    )
  }

  return { blocks: nextBlocks, groups: nextGroups }
}

function moveTerminalWorkflowToPosition(
  blocks: readonly TerminalBlockSnapshot[],
  movedBlockIds: ReadonlySet<string>,
  draggedBlockId: string,
  position: BlockPositionSnapshot
): TerminalBlockSnapshot[] {
  const draggedBlock = blocks.find((block) => block.id === draggedBlockId)
  if (!draggedBlock) return [...blocks]
  const delta = {
    x: position.x - draggedBlock.position.x,
    y: position.y - draggedBlock.position.y
  }

  return blocks.map((block) =>
    movedBlockIds.has(block.id)
      ? {
          ...block,
          position: {
            x: block.position.x + delta.x,
            y: block.position.y + delta.y
          }
        }
      : block
  )
}

function layoutTerminalGroupMembers(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[]
): TerminalGroupMemberLayoutResult {
  const memberIds = new Set(group.memberBlockIds)
  const memberBlocks = blocks.filter((block) => memberIds.has(block.id))
  if (memberBlocks.length === 0) {
    return { blocks: [...blocks], group }
  }

  const relativeLayouts = createBalancedTerminalBlockLayouts(memberBlocks, connections)
  const positionByBlockId = new Map(
    relativeLayouts.map((layout) => [
      layout.blockId,
      {
        x: group.position.x + terminalGroupPadding.x + layout.position.x,
        y: group.position.y + terminalGroupPadding.y + layout.position.y
      }
    ])
  )
  const nextBlocks = blocks.map((block) => {
    const nextPosition = positionByBlockId.get(block.id)
    return nextPosition ? { ...block, position: nextPosition } : block
  })

  return {
    blocks: nextBlocks,
    group: normalizeTerminalGroupBounds(group, nextBlocks)
  }
}

function normalizeGroupsContainingAnyBlock(
  groups: readonly TerminalGroupSnapshot[],
  blocks: readonly TerminalBlockSnapshot[],
  blockIds: ReadonlySet<string>
): TerminalGroupSnapshot[] {
  return groups.map((group) =>
    group.memberBlockIds.some((memberId) => blockIds.has(memberId))
      ? normalizeTerminalGroupBounds(group, blocks)
      : group
  )
}
