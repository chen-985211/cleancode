import { terminalBlockVisibleSize } from '../aggregates/BlockGraphTypes'
import type {
  BlockPositionSnapshot,
  CreateTerminalGroupInput,
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import {
  minimumTerminalGroupSize,
  createTerminalGroupBounds,
  normalizeRequestedTerminalGroupSize,
  normalizeTerminalGroupBounds,
  terminalGroupPadding
} from './TerminalGroupRules'
import { createTerminalFlowRowLayouts } from './TerminalDependencyLayout'

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

export function createTerminalGroupLayout(
  input: CreateTerminalGroupInput & {
    readonly id: string
    readonly memberBlockIds: readonly string[]
  },
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  memberLayout: 'flow-rows' | 'preserve' = 'flow-rows'
): TerminalGroupMemberLayoutResult {
  const bounds = createTerminalGroupBounds(input.memberBlockIds, blocks)
  const group: TerminalGroupSnapshot = {
    id: input.id,
    type: 'terminal-group',
    name: input.name,
    position: input.position ?? bounds.position,
    size: input.size ? normalizeRequestedTerminalGroupSize(input.size) : bounds.size,
    isCollapsed: false,
    memberBlockIds: input.memberBlockIds
  }
  return memberLayout === 'preserve' || group.memberBlockIds.length === 0
    ? { blocks: [...blocks], group }
    : layoutTerminalGroupMembers(group, blocks, connections)
}

export function layoutTerminalGroups(
  groups: readonly TerminalGroupSnapshot[],
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  mode: 'flow-rows' | 'preserve-valid' = 'flow-rows'
): { readonly blocks: TerminalBlockSnapshot[]; readonly groups: TerminalGroupSnapshot[] } {
  let nextBlocks = [...blocks]
  const nextGroups = groups.map((group) => {
    if (
      group.memberBlockIds.length === 0 ||
      (mode === 'preserve-valid' && hasValidMemberLayout(group, nextBlocks))
    )
      return group
    const layout = layoutTerminalGroupMembers(group, nextBlocks, connections)
    nextBlocks = layout.blocks
    return layout.group
  })
  return { blocks: nextBlocks, groups: nextGroups }
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
  const hasMembershipChange = [...movedBlockIds].some(
    (id) =>
      (groups.find((group) => group.memberBlockIds.includes(id))?.id ?? null) !==
      targetTerminalGroupId
  )
  if (!hasMembershipChange) {
    const positionedBlocks = position
      ? moveTerminalWorkflowToPosition(blocks, movedBlockIds, blockId, position)
      : [...blocks]

    const group = groups.find((candidate) => candidate.id === targetTerminalGroupId)
    if (group) {
      const layout = layoutTerminalGroupMembers(group, positionedBlocks, connections)
      return {
        blocks: layout.blocks,
        groups: groups.map((candidate) => (candidate.id === group.id ? layout.group : candidate))
      }
    }
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
    [
      sourceTerminalGroupId,
      targetTerminalGroupId,
      ...groups
        .filter((group) => group.memberBlockIds.some((id) => movedBlockIds.has(id)))
        .map((group) => group.id)
    ].filter((groupId): groupId is string => groupId !== null)
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

export function layoutTerminalGroupMembers(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[]
): TerminalGroupMemberLayoutResult {
  const memberIds = new Set(group.memberBlockIds)
  const memberBlocks = blocks.filter((block) => memberIds.has(block.id))
  if (memberBlocks.length === 0) {
    return { blocks: [...blocks], group: { ...group, size: minimumTerminalGroupSize } }
  }

  const relativeLayouts = createTerminalFlowRowLayouts(memberBlocks, connections)
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

// Reading a saved graph must not arrange an already valid template instance.
// Legacy overlapping/out-of-bounds members still recover at the stored group anchor.
function hasValidMemberLayout(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[]
): boolean {
  const members = blocks.filter((block) => group.memberBlockIds.includes(block.id))
  const rects = members.map((block) => ({ ...block.position, ...terminalBlockVisibleSize(block) }))
  if (
    Math.min(...rects.map((rect) => rect.x)) !== group.position.x + terminalGroupPadding.x ||
    Math.min(...rects.map((rect) => rect.y)) !== group.position.y + terminalGroupPadding.y
  )
    return false
  return rects.every(
    (rect, index) =>
      rect.x >= group.position.x + terminalGroupPadding.x &&
      rect.y >= group.position.y + terminalGroupPadding.y &&
      rect.x + rect.width <= group.position.x + group.size.width - terminalGroupPadding.x &&
      rect.y + rect.height <= group.position.y + group.size.height - terminalGroupPadding.x &&
      rects
        .slice(index + 1)
        .every(
          (other) =>
            rect.x + rect.width <= other.x ||
            other.x + other.width <= rect.x ||
            rect.y + rect.height <= other.y ||
            other.y + other.height <= rect.y
        )
  )
}
