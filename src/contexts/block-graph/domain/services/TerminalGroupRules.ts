import type {
  BlockPositionSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSizeSnapshot,
  TerminalGroupSnapshot
} from '../aggregates/BlockGraphTypes'

export const defaultTerminalGroupSize: TerminalGroupSizeSnapshot = {
  width: 520,
  height: 320
}

const terminalGroupPadding = {
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

    if (!hasEnoughTerminalGroupMembers({ memberBlockIds })) {
      continue
    }

    for (const memberBlockId of memberBlockIds) {
      assignedBlockIds.add(memberBlockId)
    }

    validGroups.push(
      normalizeTerminalGroupBounds(
        {
          id: group.id ?? createTerminalGroupId(),
          type: 'terminal-group',
          name: normalizeRestoredTerminalGroupName(group.name),
          position: normalizeBlockPosition(group.position),
          size: normalizeTerminalGroupSize(group.size),
          isCollapsed: group.isCollapsed === true,
          memberBlockIds
        },
        blocks
      )
    )
  }

  return validGroups
}

export function normalizeTerminalGroupMemberIds(memberBlockIds: readonly string[]): string[] {
  return Array.from(new Set(memberBlockIds))
}

export function hasEnoughTerminalGroupMembers(group: {
  readonly memberBlockIds: readonly string[]
}): boolean {
  return group.memberBlockIds.length >= 2
}

export function normalizeTerminalGroupBounds(
  group: TerminalGroupSnapshot,
  blocks: readonly TerminalBlockSnapshot[]
): TerminalGroupSnapshot {
  const memberBlocks = blocks.filter((block) => group.memberBlockIds.includes(block.id))

  if (memberBlocks.length < 2) {
    return group
  }

  const bounds = getTerminalGroupMemberBounds(memberBlocks)

  return {
    ...group,
    position: {
      x: bounds.left - terminalGroupPadding.x,
      y: bounds.top - terminalGroupPadding.y
    },
    size: {
      width: Math.max(
        defaultTerminalGroupSize.width,
        bounds.right - bounds.left + terminalGroupPadding.x * 2
      ),
      height: Math.max(
        defaultTerminalGroupSize.height,
        bounds.bottom - bounds.top + terminalGroupPadding.y * 2
      )
    }
  }
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

function getTerminalGroupMemberBounds(blocks: readonly TerminalBlockSnapshot[]) {
  return blocks.reduce(
    (bounds, block) => ({
      left: Math.min(bounds.left, block.position.x),
      top: Math.min(bounds.top, block.position.y),
      right: Math.max(bounds.right, block.position.x + block.size.width),
      bottom: Math.max(bounds.bottom, block.position.y + block.size.height)
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
      defaultTerminalGroupSize.width,
      defaultTerminalGroupSize.width
    ),
    height: normalizeSizeValue(
      size?.height,
      defaultTerminalGroupSize.height,
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
