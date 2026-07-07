import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  defaultCanvasViewport,
  defaultTerminalBlockSize,
  maximumCanvasZoom,
  minimumCanvasZoom,
  minimumTerminalBlockSize,
  type BlockGraphSnapshot,
  type BlockPositionSnapshot,
  type CanvasViewportSnapshot,
  type CreateDefaultGraphInput,
  type CreateTerminalBlockInput,
  type CreateTerminalGroupInput,
  type ResizeTerminalBlockInput,
  type RestorableBlockGraphSnapshot,
  type RestorableTerminalBlockSnapshot,
  type TerminalBlockSizeSnapshot,
  type TerminalBlockSnapshot,
  type TerminalGroupSnapshot,
  type UpdateTerminalBlockMetadataInput,
  type UpdateTerminalGroupMetadataInput
} from './BlockGraphTypes'
import {
  defaultTerminalGroupSize,
  hasEnoughTerminalGroupMembers,
  normalizeTerminalGroupBounds,
  normalizeTerminalGroupMemberIds,
  normalizeTerminalGroups
} from '../services/TerminalGroupRules'

export type {
  BlockGraphSnapshot,
  BlockPositionSnapshot,
  CanvasViewportSnapshot,
  CreateDefaultGraphInput,
  CreateTerminalBlockInput,
  CreateTerminalGroupInput,
  ResizeTerminalBlockInput,
  RestorableBlockGraphSnapshot,
  TerminalBlockSizeSnapshot,
  TerminalBlockSnapshot,
  TerminalGroupSnapshot,
  UpdateTerminalBlockMetadataInput,
  UpdateTerminalGroupMetadataInput
} from './BlockGraphTypes'

export {
  defaultCanvasViewport,
  defaultTerminalBlockSize,
  maximumCanvasZoom,
  minimumCanvasZoom,
  minimumTerminalBlockSize
} from './BlockGraphTypes'
export { defaultTerminalGroupSize } from '../services/TerminalGroupRules'

export class BlockGraph {
  private constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly workspaceName: string,
    private viewportSnapshot: CanvasViewportSnapshot,
    private blockSnapshots: TerminalBlockSnapshot[],
    private terminalGroupSnapshots: TerminalGroupSnapshot[]
  ) {}

  static createDefault(input: CreateDefaultGraphInput): BlockGraph {
    return new BlockGraph(
      input.id ?? createGraphId(),
      input.projectId,
      input.workspaceName,
      defaultCanvasViewport,
      [],
      []
    )
  }

  static fromSnapshot(snapshot: RestorableBlockGraphSnapshot): BlockGraph {
    const blocks = [...snapshot.blocks.map(normalizeTerminalBlock)]

    return new BlockGraph(
      snapshot.id,
      snapshot.projectId,
      snapshot.workspaceName,
      normalizeCanvasViewport(snapshot.viewport, defaultCanvasViewport),
      blocks,
      normalizeTerminalGroups(snapshot.terminalGroups, blocks, createTerminalGroupId)
    )
  }

  get blocks(): readonly TerminalBlockSnapshot[] {
    return this.blockSnapshots
  }

  get viewport(): CanvasViewportSnapshot {
    return this.viewportSnapshot
  }

  get terminalGroups(): readonly TerminalGroupSnapshot[] {
    return this.terminalGroupSnapshots
  }

  createTerminalBlock(input: CreateTerminalBlockInput): TerminalBlockSnapshot {
    const block: TerminalBlockSnapshot = {
      id: input.id ?? createBlockId(),
      type: 'terminal',
      name: input.name,
      description: input.description,
      launchCommand: '',
      position: input.position,
      size: normalizeTerminalBlockSize(input.size)
    }

    this.blockSnapshots = [...this.blockSnapshots, block]

    return block
  }

  moveBlock(blockId: string, position: BlockPositionSnapshot): void {
    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, position } : block
    )
    this.normalizeGroupsContainingBlock(blockId)
  }

  updateViewport(viewport: Partial<CanvasViewportSnapshot>): void {
    this.viewportSnapshot = normalizeCanvasViewport(viewport, this.viewportSnapshot)
  }

  resizeTerminalBlock(blockId: string, input: ResizeTerminalBlockInput['size']): void {
    let hasUpdatedBlock = false
    const size = normalizeTerminalBlockSize(input)

    this.blockSnapshots = this.blockSnapshots.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      hasUpdatedBlock = true

      return { ...block, size }
    })

    if (!hasUpdatedBlock) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    this.normalizeGroupsContainingBlock(blockId)
  }

  updateTerminalBlockMetadata(blockId: string, input: UpdateTerminalBlockMetadataInput): void {
    const name = input.name.trim()

    if (!name) {
      throw createExpectedAppError(
        'TERMINAL_BLOCK_NAME_EMPTY',
        'Terminal block name cannot be empty.'
      )
    }

    let hasUpdatedBlock = false

    this.blockSnapshots = this.blockSnapshots.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      hasUpdatedBlock = true

      return {
        ...block,
        name,
        description: input.description.trim(),
        launchCommand: normalizeTerminalLaunchCommand(input.launchCommand)
      }
    })

    if (!hasUpdatedBlock) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }
  }

  deleteBlock(blockId: string): void {
    this.blockSnapshots = this.blockSnapshots.filter((block) => block.id !== blockId)
    this.terminalGroupSnapshots = this.terminalGroupSnapshots
      .map((group) => ({
        ...group,
        memberBlockIds: group.memberBlockIds.filter((memberBlockId) => memberBlockId !== blockId)
      }))
      .filter(hasEnoughTerminalGroupMembers)
      .map((group) => normalizeTerminalGroupBounds(group, this.blockSnapshots))
  }

  createTerminalGroup(input: CreateTerminalGroupInput): TerminalGroupSnapshot {
    const name = input.name.trim()

    if (!name) {
      throw createExpectedAppError(
        'TERMINAL_GROUP_NAME_EMPTY',
        'Terminal group name cannot be empty.'
      )
    }

    const memberBlockIds = normalizeTerminalGroupMemberIds(input.memberBlockIds)

    this.ensureTerminalGroupMembersCanBeGrouped(memberBlockIds)

    const group = normalizeTerminalGroupBounds(
      {
        id: input.id ?? createTerminalGroupId(),
        type: 'terminal-group',
        name,
        position: { x: 0, y: 0 },
        size: defaultTerminalGroupSize,
        isCollapsed: false,
        memberBlockIds
      },
      this.blockSnapshots
    )

    this.terminalGroupSnapshots = [...this.terminalGroupSnapshots, group]

    return group
  }

  updateTerminalGroupMetadata(
    terminalGroupId: string,
    input: UpdateTerminalGroupMetadataInput
  ): void {
    const name = input.name.trim()

    if (!name) {
      throw createExpectedAppError(
        'TERMINAL_GROUP_NAME_EMPTY',
        'Terminal group name cannot be empty.'
      )
    }

    let hasUpdatedGroup = false

    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) => {
      if (group.id !== terminalGroupId) {
        return group
      }

      hasUpdatedGroup = true

      return { ...group, name }
    })

    if (!hasUpdatedGroup) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }
  }

  setTerminalGroupCollapsed(terminalGroupId: string, isCollapsed: boolean): void {
    let hasUpdatedGroup = false

    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) => {
      if (group.id !== terminalGroupId) {
        return group
      }

      hasUpdatedGroup = true

      return { ...group, isCollapsed }
    })

    if (!hasUpdatedGroup) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }
  }

  moveTerminalGroup(terminalGroupId: string, position: BlockPositionSnapshot): void {
    const group = this.requireTerminalGroup(terminalGroupId)
    const delta = {
      x: position.x - group.position.x,
      y: position.y - group.position.y
    }
    const memberBlockIds = new Set(group.memberBlockIds)

    this.blockSnapshots = this.blockSnapshots.map((block) =>
      memberBlockIds.has(block.id)
        ? {
            ...block,
            position: {
              x: block.position.x + delta.x,
              y: block.position.y + delta.y
            }
          }
        : block
    )
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((currentGroup) =>
      currentGroup.id === terminalGroupId
        ? normalizeTerminalGroupBounds({ ...currentGroup, position }, this.blockSnapshots)
        : currentGroup
    )
  }

  addTerminalToGroup(terminalGroupId: string, blockId: string): void {
    this.requireTerminalBlock(blockId)

    if (this.findTerminalGroupByBlockId(blockId)) {
      throw createExpectedAppError(
        'TERMINAL_BLOCK_ALREADY_GROUPED',
        'Terminal block already belongs to a group.'
      )
    }

    let hasUpdatedGroup = false

    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) => {
      if (group.id !== terminalGroupId) {
        return group
      }

      hasUpdatedGroup = true

      return normalizeTerminalGroupBounds(
        {
          ...group,
          memberBlockIds: [...group.memberBlockIds, blockId]
        },
        this.blockSnapshots
      )
    })

    if (!hasUpdatedGroup) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }
  }

  removeTerminalFromGroup(terminalGroupId: string, blockId: string): void {
    let hasUpdatedGroup = false

    this.terminalGroupSnapshots = this.terminalGroupSnapshots
      .map((group) => {
        if (group.id !== terminalGroupId) {
          return group
        }

        hasUpdatedGroup = true

        return {
          ...group,
          memberBlockIds: group.memberBlockIds.filter((memberBlockId) => memberBlockId !== blockId)
        }
      })
      .filter(hasEnoughTerminalGroupMembers)
      .map((group) => normalizeTerminalGroupBounds(group, this.blockSnapshots))

    if (!hasUpdatedGroup) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }
  }

  dissolveTerminalGroup(terminalGroupId: string): void {
    const nextGroups = this.terminalGroupSnapshots.filter((group) => group.id !== terminalGroupId)

    if (nextGroups.length === this.terminalGroupSnapshots.length) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }

    this.terminalGroupSnapshots = nextGroups
  }

  toSnapshot(): BlockGraphSnapshot {
    return {
      id: this.id,
      projectId: this.projectId,
      workspaceName: this.workspaceName,
      viewport: this.viewportSnapshot,
      blocks: this.blockSnapshots,
      terminalGroups: this.terminalGroupSnapshots
    }
  }

  private ensureTerminalGroupMembersCanBeGrouped(memberBlockIds: readonly string[]): void {
    if (memberBlockIds.length < 2) {
      throw createExpectedAppError(
        'TERMINAL_GROUP_REQUIRES_TWO_MEMBERS',
        'Terminal group must contain at least two terminals.'
      )
    }

    for (const memberBlockId of memberBlockIds) {
      this.requireTerminalBlock(memberBlockId)

      if (this.findTerminalGroupByBlockId(memberBlockId)) {
        throw createExpectedAppError(
          'TERMINAL_BLOCK_ALREADY_GROUPED',
          'Terminal block already belongs to a group.'
        )
      }
    }
  }

  private requireTerminalBlock(blockId: string): TerminalBlockSnapshot {
    const block = this.blockSnapshots.find((candidateBlock) => candidateBlock.id === blockId)

    if (!block) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    return block
  }

  private requireTerminalGroup(terminalGroupId: string): TerminalGroupSnapshot {
    const group = this.terminalGroupSnapshots.find(
      (candidateGroup) => candidateGroup.id === terminalGroupId
    )

    if (!group) {
      throw createExpectedAppError('TERMINAL_GROUP_NOT_FOUND', 'Terminal group was not found.')
    }

    return group
  }

  private findTerminalGroupByBlockId(blockId: string): TerminalGroupSnapshot | undefined {
    return this.terminalGroupSnapshots.find((group) => group.memberBlockIds.includes(blockId))
  }

  private normalizeGroupsContainingBlock(blockId: string): void {
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) =>
      group.memberBlockIds.includes(blockId)
        ? normalizeTerminalGroupBounds(group, this.blockSnapshots)
        : group
    )
  }
}

function createGraphId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `graph-${Date.now()}-${Math.random()}`
}
function createBlockId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random()}`
}
function createTerminalGroupId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-group-${Date.now()}-${Math.random()}`
}

function normalizeCanvasViewport(
  viewport: Partial<CanvasViewportSnapshot> | undefined,
  fallback: CanvasViewportSnapshot
): CanvasViewportSnapshot {
  return {
    x: normalizeViewportCoordinate(viewport?.x, fallback.x),
    y: normalizeViewportCoordinate(viewport?.y, fallback.y),
    zoom: normalizeCanvasZoom(viewport?.zoom, fallback.zoom)
  }
}

function normalizeViewportCoordinate(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return value
}
function normalizeCanvasZoom(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.min(maximumCanvasZoom, Math.max(minimumCanvasZoom, value))
}
function normalizeTerminalBlock(block: RestorableTerminalBlockSnapshot): TerminalBlockSnapshot {
  return {
    ...block,
    launchCommand: normalizeTerminalLaunchCommand(block.launchCommand),
    size: normalizeTerminalBlockSize(block.size)
  }
}
function normalizeTerminalLaunchCommand(command: string | undefined): string {
  return command?.trim() ?? ''
}

function normalizeTerminalBlockSize(
  size: Partial<TerminalBlockSizeSnapshot> | undefined
): TerminalBlockSizeSnapshot {
  return {
    width: normalizeSizeValue(
      size?.width,
      minimumTerminalBlockSize.width,
      defaultTerminalBlockSize.width
    ),
    height: normalizeSizeValue(
      size?.height,
      minimumTerminalBlockSize.height,
      defaultTerminalBlockSize.height
    )
  }
}

function normalizeSizeValue(value: number | undefined, minimum: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.max(minimum, Math.round(value))
}
