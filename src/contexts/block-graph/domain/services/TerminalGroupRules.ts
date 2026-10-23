import { terminalBlockVisibleSize } from '../aggregates/BlockGraphTypes'
import type {
  BlockPositionSnapshot,
  TerminalBlockSnapshot,
  TerminalConnectionSnapshot,
  TerminalGroupSizeSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'
import {
  analyzeCanvasExecutionSelection,
  type CanvasExecutionSelectionAnalysis
} from '../../../../shared-kernel/domain/policies/CanvasExecutionSemantics'

type TerminalMemberGeometry = Pick<
  TerminalBlockSnapshot,
  'id' | 'position' | 'size' | 'isCollapsed'
>

export const minimumTerminalGroupSize: TerminalGroupSizeSnapshot = { width: 320, height: 160 }

export const defaultTerminalGroupSize: TerminalGroupSizeSnapshot = {
  width: 520,
  height: 320
}

export const terminalGroupPadding = {
  x: 32,
  y: 76
}

export function normalizeTerminalGroups(
  groups: readonly Partial<TerminalGroupSnapshot>[] | undefined,
  blocks: readonly TerminalBlockSnapshot[],
  createTerminalGroupId: () => string
): TerminalGroupSnapshot[] {
  const assignedBlockIds = new Set<string>()
  const validGroups: TerminalGroupSnapshot[] = []

  for (const group of groups ?? []) {
    const memberBlockIds = normalizeRestoredTerminalGroupMemberIds(
      group.memberBlockIds,
      blocks,
      assignedBlockIds
    )

    for (const memberBlockId of memberBlockIds) {
      assignedBlockIds.add(memberBlockId)
    }

    validGroups.push({
      id: group.id ?? createTerminalGroupId(),
      type: 'terminal-group',
      name: normalizeRestoredTerminalGroupName(group.name),
      position: group.position
        ? normalizeBlockPosition(group.position)
        : createTerminalGroupBounds(memberBlockIds, blocks).position,
      size: normalizeTerminalGroupSize(group.size),
      isCollapsed: group.isCollapsed === true,
      memberBlockIds
    })
  }

  return validGroups
}

export function expandTerminalGroupMemberIdsToCompleteWorkflows(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  requestedMemberBlockIds: readonly string[]
): string[] {
  return [
    ...analyzeTerminalGroupMemberSelection(blocks, connections, requestedMemberBlockIds)
      .expandedTerminalIds
  ]
}

export function analyzeTerminalGroupMemberSelection(
  blocks: readonly TerminalBlockSnapshot[],
  connections: readonly TerminalConnectionSnapshot[],
  requestedMemberBlockIds: readonly string[]
): CanvasExecutionSelectionAnalysis {
  return analyzeCanvasExecutionSelection({
    dependencies: connections.map((connection) => ({
      sourceTerminalId: connection.sourceBlockId,
      targetTerminalId: connection.targetBlockId
    })),
    selectedTerminalIds: requestedMemberBlockIds,
    terminals: blocks.map((block) => ({ terminalId: block.id }))
  })
}

export function normalizeTerminalGroupBounds(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[]
): TerminalGroupSnapshot {
  const memberBlocks = blocks.filter((block) => group.memberBlockIds.includes(block.id))

  if (memberBlocks.length === 0) return group

  return {
    ...group,
    ...createTerminalGroupBounds(group.memberBlockIds, blocks)
  }
}

export function createTerminalGroupBounds(
  memberBlockIds: readonly string[],
  blocks: readonly TerminalMemberGeometry[]
): Pick<TerminalGroupSnapshot, 'position' | 'size'> {
  const memberBlocks = blocks.filter((block) => memberBlockIds.includes(block.id))
  if (memberBlocks.length === 0) {
    return { position: { x: 0, y: 0 }, size: defaultTerminalGroupSize }
  }

  const bounds = getTerminalGroupMemberBounds(memberBlocks)
  const hasCompactMembers = memberBlocks.some((block) => block.isCollapsed)
  return {
    position: {
      x: bounds.left - terminalGroupPadding.x,
      y: bounds.top - terminalGroupPadding.y
    },
    size: {
      width: Math.max(
        hasCompactMembers ? minimumTerminalGroupSize.width : defaultTerminalGroupSize.width,
        bounds.right - bounds.left + terminalGroupPadding.x * 2
      ),
      height: Math.max(
        hasCompactMembers ? minimumTerminalGroupSize.height : defaultTerminalGroupSize.height,
        bounds.bottom -
          bounds.top +
          terminalGroupPadding.y +
          (hasCompactMembers ? terminalGroupPadding.x : terminalGroupPadding.y)
      )
    }
  }
}

export function normalizeRequestedTerminalGroupSize(
  size: Partial<TerminalGroupSizeSnapshot> | undefined
): TerminalGroupSizeSnapshot {
  return normalizeTerminalGroupSize(size)
}

function normalizeTerminalGroupMemberIds(memberBlockIds: readonly string[]): string[] {
  return Array.from(new Set(memberBlockIds))
}

function normalizeRestoredTerminalGroupMemberIds(
  memberBlockIds: readonly string[] | undefined,
  blocks: readonly TerminalBlockSnapshot[],
  assignedBlockIds: ReadonlySet<string>
): string[] {
  const blockIds = new Set(blocks.map((block) => block.id))

  return normalizeTerminalGroupMemberIds(memberBlockIds ?? []).filter(
    (memberBlockId) => blockIds.has(memberBlockId) && !assignedBlockIds.has(memberBlockId)
  )
}

function normalizeRestoredTerminalGroupName(name: string | undefined): string {
  const trimmedName = name?.trim()

  return trimmedName ? trimmedName : '终端组合'
}

function getTerminalGroupMemberBounds(blocks: readonly TerminalMemberGeometry[]) {
  return blocks.reduce(
    (bounds, block) => ({
      left: Math.min(bounds.left, block.position.x),
      top: Math.min(bounds.top, block.position.y),
      right: Math.max(bounds.right, block.position.x + terminalBlockVisibleSize(block).width),
      bottom: Math.max(bounds.bottom, block.position.y + terminalBlockVisibleSize(block).height)
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  )
}

function normalizeBlockPosition(position: Partial<BlockPositionSnapshot> | undefined) {
  return {
    x: normalizePositionValue(position?.x),
    y: normalizePositionValue(position?.y)
  }
}

function normalizePositionValue(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.round(value)
}

function normalizeTerminalGroupSize(
  size: Partial<TerminalGroupSizeSnapshot> | undefined
): TerminalGroupSizeSnapshot {
  return {
    width: normalizeSizeValue(
      size?.width,
      minimumTerminalGroupSize.width,
      defaultTerminalGroupSize.width
    ),
    height: normalizeSizeValue(
      size?.height,
      minimumTerminalGroupSize.height,
      defaultTerminalGroupSize.height
    )
  }
}

function normalizeSizeValue(value: number | undefined, minimum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(minimum, Math.round(value))
}
