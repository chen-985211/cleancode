import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  defaultCanvasViewport,
  defaultTerminalExecutionConfig,
  type BlockGraphSnapshot,
  type BlockPositionSnapshot,
  type CanvasViewportSnapshot,
  type ConnectTerminalBlocksInput,
  type CreateDefaultGraphInput,
  type CreateTerminalBlockInput,
  type CreateTerminalGroupInput,
  type ResizeTerminalBlockInput,
  type RestorableBlockGraphSnapshot,
  type TerminalBlockSnapshot,
  type TerminalConnectionSnapshot,
  type TerminalGroupSnapshot,
  type UpdateTerminalBlockMetadataInput,
  type UpdateTerminalDefinitionInput,
  type UpdateTerminalExecutionConfigInput,
  type UpdateTerminalGroupMetadataInput
} from './BlockGraphTypes'
import {
  defaultTerminalGroupSize,
  hasEnoughTerminalGroupMembers,
  normalizeTerminalGroupBounds,
  normalizeTerminalGroupMemberIds,
  normalizeTerminalGroups
} from '../services/TerminalGroupRules'
import {
  applyTerminalLayoutPlan,
  createTerminalLayoutPlan,
  toTerminalLayoutResult,
  type ArrangeTerminalLayoutInput,
  type TerminalLayoutResult
} from '../services/TerminalLayoutPolicy'
import {
  normalizeCanvasViewport,
  normalizeTerminalBlock,
  normalizeTerminalBlockSize,
  normalizeTerminalLaunchCommand
} from '../services/BlockGraphNormalization'
import {
  normalizeTerminalBlockMetadata,
  normalizeTerminalDefinition
} from '../services/TerminalDefinitionRules'
import {
  addTerminalConnection,
  normalizeRestoredTerminalConnections,
  removeTerminalConnection,
  validateTerminalExecutionConfig
} from '../services/TerminalWorkflowRules'
import {
  createBlockId,
  createGraphId,
  createTerminalConnectionId,
  createTerminalGroupId
} from '../services/BlockGraphIdentifiers'

export type * from './BlockGraphTypes'

export {
  defaultCanvasViewport,
  defaultTerminalExecutionConfig,
  defaultTerminalBlockSize,
  maximumCanvasZoom,
  minimumCanvasZoom,
  minimumTerminalBlockSize
} from './BlockGraphTypes'
export { defaultTerminalGroupSize } from '../services/TerminalGroupRules'
export type {
  ArrangeTerminalLayoutInput,
  TerminalLayoutRegion,
  TerminalLayoutResult
} from '../services/TerminalLayoutPolicy'

export class BlockGraph {
  private constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly workspaceName: string,
    private viewportSnapshot: CanvasViewportSnapshot,
    private blockSnapshots: TerminalBlockSnapshot[],
    private terminalConnectionSnapshots: TerminalConnectionSnapshot[],
    private terminalGroupSnapshots: TerminalGroupSnapshot[]
  ) {}

  static createDefault(input: CreateDefaultGraphInput): BlockGraph {
    return new BlockGraph(
      input.id ?? createGraphId(),
      input.projectId,
      input.workspaceName,
      defaultCanvasViewport,
      [],
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
      normalizeRestoredTerminalConnections(snapshot.connections, blocks),
      normalizeTerminalGroups(snapshot.terminalGroups, blocks, createTerminalGroupId)
    )
  }

  get blocks(): readonly TerminalBlockSnapshot[] {
    return this.blockSnapshots
  }

  get viewport(): CanvasViewportSnapshot {
    return this.viewportSnapshot
  }

  get connections(): readonly TerminalConnectionSnapshot[] {
    return this.terminalConnectionSnapshots
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
      launchCommand: normalizeTerminalLaunchCommand(input.launchCommand ?? ''),
      executionConfig: {
        ...defaultTerminalExecutionConfig,
        successExitCodes: [...defaultTerminalExecutionConfig.successExitCodes]
      },
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

  arrangeTerminalLayout(input: ArrangeTerminalLayoutInput): TerminalLayoutResult {
    const plan = createTerminalLayoutPlan(this.toSnapshot(), input)
    this.blockSnapshots = applyTerminalLayoutPlan(this.blockSnapshots, plan)
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) =>
      normalizeTerminalGroupBounds(group, this.blockSnapshots)
    )

    return toTerminalLayoutResult(plan)
  }

  updateViewport(viewport: Partial<CanvasViewportSnapshot>): void {
    this.viewportSnapshot = normalizeCanvasViewport(viewport, this.viewportSnapshot)
  }

  resizeTerminalBlock(blockId: string, input: ResizeTerminalBlockInput): void {
    let hasUpdatedBlock = false
    const size = normalizeTerminalBlockSize(input.size)

    this.blockSnapshots = this.blockSnapshots.map((block) => {
      if (block.id !== blockId) {
        return block
      }

      hasUpdatedBlock = true

      return { ...block, position: input.position, size }
    })

    if (!hasUpdatedBlock) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }

    this.normalizeGroupsContainingBlock(blockId)
  }

  updateTerminalBlockMetadata(blockId: string, input: UpdateTerminalBlockMetadataInput): void {
    this.requireTerminalBlock(blockId)
    const metadata = normalizeTerminalBlockMetadata(input)
    this.blockSnapshots = this.blockSnapshots.map((block) => {
      return block.id === blockId ? { ...block, ...metadata } : block
    })
  }

  updateTerminalExecutionConfig(blockId: string, input: UpdateTerminalExecutionConfigInput): void {
    this.requireTerminalBlock(blockId)
    const executionConfig = validateTerminalExecutionConfig(input)

    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, executionConfig } : block
    )
  }

  updateTerminalDefinition(blockId: string, input: UpdateTerminalDefinitionInput): void {
    this.requireTerminalBlock(blockId)
    const definition = normalizeTerminalDefinition(input)

    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, ...definition } : block
    )
  }

  connectTerminalBlocks(input: ConnectTerminalBlocksInput): TerminalConnectionSnapshot {
    const result = addTerminalConnection(
      this.blockSnapshots,
      this.terminalConnectionSnapshots,
      input,
      createTerminalConnectionId
    )
    this.terminalConnectionSnapshots = [...result.connections]

    return result.connection
  }

  disconnectTerminalBlocks(connectionId: string): void {
    this.terminalConnectionSnapshots = [
      ...removeTerminalConnection(this.terminalConnectionSnapshots, connectionId)
    ]
  }

  deleteBlock(blockId: string): void {
    this.requireTerminalBlock(blockId)
    this.blockSnapshots = this.blockSnapshots.filter((block) => block.id !== blockId)
    this.terminalConnectionSnapshots = this.terminalConnectionSnapshots.filter(
      (connection) => connection.sourceBlockId !== blockId && connection.targetBlockId !== blockId
    )
    this.terminalGroupSnapshots = this.terminalGroupSnapshots
      .map((group) => ({
        ...group,
        memberBlockIds: group.memberBlockIds.filter((memberBlockId) => memberBlockId !== blockId)
      }))
      .filter(hasEnoughTerminalGroupMembers)
      .map((group) => normalizeTerminalGroupBounds(group, this.blockSnapshots))
  }

  ensureTerminalBlockExists(blockId: string): void {
    this.requireTerminalBlock(blockId)
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
      connections: this.terminalConnectionSnapshots,
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
