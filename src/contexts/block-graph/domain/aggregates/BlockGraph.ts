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
  type QuickExecutionSlotSnapshot,
  type QuickExecutionTargetSnapshot,
  type ResizeTerminalBlockInput,
  type RestorableBlockGraphSnapshot,
  type TerminalBlockSnapshot,
  type TerminalConnectionSnapshot,
  type TerminalGroupSnapshot,
  type TerminalRemovalTargetSnapshot,
  type UpdateTerminalBlockMetadataInput,
  type UpdateTerminalDefinitionInput,
  type UpdateTerminalExecutionConfigInput,
  type UpdateTerminalGroupMetadataInput
} from './BlockGraphTypes'
import {
  analyzeTerminalGroupMemberSelection,
  minimumTerminalGroupSize,
  expandTerminalGroupMemberIdsToCompleteWorkflows,
  normalizeTerminalGroupBounds,
  normalizeTerminalGroups
} from '../services/TerminalGroupRules'
import {
  applyTerminalGroupMembershipMove,
  createTerminalGroupLayout,
  layoutTerminalGroups
} from '../services/TerminalGroupMemberLayout'
import { resizedTerminalBlock, terminalExpansionSize } from '../services/TerminalExpansionSize'
import {
  expandTerminalGroupLayout,
  reflowTerminalDisclosure
} from '../services/TerminalDisclosureLayout'
import {
  applyTerminalGroupLayoutPlan,
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
import type { BlockTemplateSnapshot, InstantiatedBlockTemplateSnapshot } from './BlockTemplateTypes'
import { instantiateBlockTemplate } from '../services/BlockTemplateInstantiation'
import {
  createEmptyQuickExecutionSlots,
  normalizeQuickExecutionTarget,
  requireQuickExecutionSlotNumber,
  restoreQuickExecutionSlots
} from '../services/QuickExecutionSlotRules'
import { resolveTerminalRemovalBlockIds } from '../services/TerminalRemovalRules'
import { BlockTemplateApplications } from '../services/BlockTemplateApplications'

export type * from './BlockGraphTypes'

export {
  defaultCanvasViewport,
  defaultTerminalExecutionConfig,
  defaultTerminalBlockSize,
  maximumCanvasZoom,
  minimumCanvasZoom,
  minimumTerminalBlockSize
} from './BlockGraphTypes'
export { terminalBlockVisibleSize } from './BlockGraphTypes'
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
    public readonly workspaceId: string,
    private viewportSnapshot: CanvasViewportSnapshot,
    private blockSnapshots: TerminalBlockSnapshot[],
    private terminalConnectionSnapshots: TerminalConnectionSnapshot[],
    private terminalGroupSnapshots: TerminalGroupSnapshot[],
    private quickExecutionSlotSnapshots: QuickExecutionSlotSnapshot[],
    private readonly templateApplications = new BlockTemplateApplications()
  ) {}

  static createDefault(input: CreateDefaultGraphInput): BlockGraph {
    return new BlockGraph(
      input.id ?? createGraphId(),
      input.projectId,
      input.workspaceId,
      defaultCanvasViewport,
      [],
      [],
      [],
      createEmptyQuickExecutionSlots()
    )
  }

  static fromSnapshot(snapshot: RestorableBlockGraphSnapshot): BlockGraph {
    let blocks = [...snapshot.blocks.map(normalizeTerminalBlock)]
    const connections = normalizeRestoredTerminalConnections(snapshot.connections, blocks)
    blocks = blocks.map((block) => ({ ...block, size: terminalExpansionSize(block, connections) }))
    const groups = normalizeTerminalGroups(
      snapshot.terminalGroups,
      blocks,
      connections,
      createTerminalGroupId
    )

    const layout = layoutTerminalGroups(groups, blocks, connections, 'preserve-valid')

    return new BlockGraph(
      snapshot.id,
      snapshot.projectId,
      snapshot.workspaceId,
      normalizeCanvasViewport(snapshot.viewport, defaultCanvasViewport),
      layout.blocks,
      connections,
      layout.groups,
      restoreQuickExecutionSlots(snapshot.quickExecutionSlots),
      new BlockTemplateApplications(snapshot.templateApplications)
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

  get quickExecutionSlots(): readonly QuickExecutionSlotSnapshot[] {
    return this.quickExecutionSlotSnapshots
  }

  bindQuickExecutionSlot(number: number, target: QuickExecutionTargetSnapshot): void {
    const slotNumber = requireQuickExecutionSlotNumber(number)
    const normalizedTarget = normalizeQuickExecutionTarget(
      target,
      this.blockSnapshots,
      this.terminalConnectionSnapshots,
      this.terminalGroupSnapshots
    )
    this.quickExecutionSlotSnapshots = this.quickExecutionSlotSnapshots.map((slot) =>
      slot.number === slotNumber ? { ...slot, target: normalizedTarget } : slot
    )
  }

  addQuickExecutionTarget(target: QuickExecutionTargetSnapshot): void {
    const emptySlot = this.quickExecutionSlotSnapshots.find((slot) => !slot.target)
    if (!emptySlot) {
      throw createExpectedAppError('QUICK_EXECUTION_BAR_FULL', 'Quick execution bar is full.')
    }
    this.bindQuickExecutionSlot(emptySlot.number, target)
  }

  clearQuickExecutionSlot(number: number): void {
    const slotNumber = requireQuickExecutionSlotNumber(number)
    this.quickExecutionSlotSnapshots = this.quickExecutionSlotSnapshots.map((slot) =>
      slot.number === slotNumber ? { ...slot, target: null } : slot
    )
  }

  reorderQuickExecutionSlots(sourceNumber: number, destinationNumber: number): void {
    const source = requireQuickExecutionSlotNumber(sourceNumber)
    const destination = requireQuickExecutionSlotNumber(destinationNumber)
    if (source === destination) return

    const sourceTarget =
      this.quickExecutionSlotSnapshots.find((slot) => slot.number === source)?.target ?? null
    const destinationTarget =
      this.quickExecutionSlotSnapshots.find((slot) => slot.number === destination)?.target ?? null
    this.quickExecutionSlotSnapshots = this.quickExecutionSlotSnapshots.map((slot) => {
      if (slot.number === source) return { ...slot, target: destinationTarget }
      if (slot.number === destination) return { ...slot, target: sourceTarget }
      return slot
    })
  }

  createTerminalBlock(input: CreateTerminalBlockInput): TerminalBlockSnapshot {
    if (input.terminalGroupId) this.requireTerminalGroup(input.terminalGroupId)

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
      size: normalizeTerminalBlockSize(input.size),
      ...(input.isCollapsed === undefined ? {} : { isCollapsed: input.isCollapsed })
    }

    this.blockSnapshots = [...this.blockSnapshots, block]
    if (input.terminalGroupId) {
      this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) =>
        group.id === input.terminalGroupId
          ? normalizeTerminalGroupBounds(
              { ...group, memberBlockIds: [...group.memberBlockIds, block.id] },
              this.blockSnapshots
            )
          : group
      )
    }

    return block
  }

  instantiateBlockTemplate(
    sourceTemplate: BlockTemplateSnapshot,
    origin: BlockPositionSnapshot,
    operationId?: string
  ): InstantiatedBlockTemplateSnapshot {
    if (operationId)
      return this.templateApplications.apply(operationId, sourceTemplate, () =>
        this.instantiateBlockTemplate(sourceTemplate, origin)
      )
    return instantiateBlockTemplate(this, sourceTemplate, origin)
  }

  moveBlock(blockId: string, position: BlockPositionSnapshot): void {
    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? { ...block, position } : block
    )
    this.normalizeGroupsContainingBlock(blockId)
  }

  arrangeTerminalLayout(input: ArrangeTerminalLayoutInput): TerminalLayoutResult {
    const plan = createTerminalLayoutPlan(this.toSnapshot(), input)
    const previousBlocks = this.blockSnapshots
    const nextBlocks = applyTerminalLayoutPlan(previousBlocks, plan)
    this.terminalGroupSnapshots = applyTerminalGroupLayoutPlan(
      this.terminalGroupSnapshots,
      previousBlocks,
      nextBlocks,
      plan
    )
    this.blockSnapshots = nextBlocks

    return toTerminalLayoutResult(plan)
  }

  updateViewport(viewport: Partial<CanvasViewportSnapshot>): void {
    this.viewportSnapshot = normalizeCanvasViewport(viewport, this.viewportSnapshot)
  }

  resizeTerminalBlock(blockId: string, input: ResizeTerminalBlockInput): void {
    const previousBlock = this.requireTerminalBlock(blockId)
    const resized = resizedTerminalBlock(previousBlock, input, this.terminalConnectionSnapshots)
    this.blockSnapshots = this.blockSnapshots.map((block) =>
      block.id === blockId ? resized : block
    )

    if (
      (input.isCollapsed !== undefined &&
        Boolean(previousBlock.isCollapsed) !== input.isCollapsed) ||
      this.terminalGroupSnapshots.some((group) => group.memberBlockIds.includes(blockId))
    ) {
      const layout = reflowTerminalDisclosure(
        blockId,
        this.blockSnapshots,
        this.terminalGroupSnapshots,
        this.terminalConnectionSnapshots
      )
      this.blockSnapshots = layout.blocks
      this.terminalGroupSnapshots = layout.groups
    } else {
      this.normalizeGroupsContainingBlock(blockId)
    }
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
    this.blockSnapshots = this.blockSnapshots.map((block) => ({
      ...block,
      size: terminalExpansionSize(block, this.terminalConnectionSnapshots)
    }))
    this.reflowTerminalGroups([input.sourceBlockId, input.targetBlockId])

    return result.connection
  }

  disconnectTerminalBlocks(connectionId: string): void {
    const connection = this.terminalConnectionSnapshots.find((edge) => edge.id === connectionId)
    this.terminalConnectionSnapshots = [
      ...removeTerminalConnection(this.terminalConnectionSnapshots, connectionId)
    ]
    this.reflowTerminalGroups(
      connection ? [connection.sourceBlockId, connection.targetBlockId] : []
    )
  }

  deleteBlock(blockId: string): void {
    this.deleteBlocks([blockId])
  }

  resolveTerminalRemovalBlockIds(target: TerminalRemovalTargetSnapshot): readonly string[] {
    return resolveTerminalRemovalBlockIds(
      target,
      this.blockSnapshots,
      this.terminalConnectionSnapshots,
      this.terminalGroupSnapshots
    )
  }

  deleteBlocks(blockIds: readonly string[]): void {
    const deletedBlockIds = new Set(blockIds)
    for (const blockId of deletedBlockIds) this.requireTerminalBlock(blockId)
    const affectedMembers = this.terminalGroupSnapshots
      .filter((group) => group.memberBlockIds.some((id) => deletedBlockIds.has(id)))
      .flatMap((group) => group.memberBlockIds)
    this.blockSnapshots = this.blockSnapshots.filter((block) => !deletedBlockIds.has(block.id))
    this.terminalConnectionSnapshots = this.terminalConnectionSnapshots.filter(
      (connection) =>
        !deletedBlockIds.has(connection.sourceBlockId) &&
        !deletedBlockIds.has(connection.targetBlockId)
    )
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((group) => {
      const memberBlockIds = group.memberBlockIds.filter((id) => !deletedBlockIds.has(id))
      return {
        ...group,
        memberBlockIds,
        ...(group.memberBlockIds.length > 0 && memberBlockIds.length === 0
          ? { size: minimumTerminalGroupSize }
          : {})
      }
    })
    this.reflowTerminalGroups(affectedMembers)
  }

  ensureTerminalBlockExists(blockId: string): void {
    this.requireTerminalBlock(blockId)
  }

  createTerminalGroup(
    input: CreateTerminalGroupInput,
    memberLayout: 'flow-rows' | 'preserve' = 'flow-rows'
  ): TerminalGroupSnapshot {
    const name = input.name.trim()

    if (!name) {
      throw createExpectedAppError(
        'TERMINAL_GROUP_NAME_EMPTY',
        'Terminal group name cannot be empty.'
      )
    }

    const analysis = analyzeTerminalGroupMemberSelection(
      this.blockSnapshots,
      this.terminalConnectionSnapshots,
      input.memberBlockIds ?? []
    )
    const memberBlockIds = [...analysis.expandedTerminalIds]

    if (analysis.unknownTerminalIds.length > 0) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }
    this.ensureTerminalGroupMembersAreAvailable(memberBlockIds)

    const layout = createTerminalGroupLayout(
      { ...input, id: input.id ?? createTerminalGroupId(), name, memberBlockIds },
      this.blockSnapshots,
      this.terminalConnectionSnapshots,
      memberLayout
    )
    this.blockSnapshots = layout.blocks
    this.terminalGroupSnapshots = [...this.terminalGroupSnapshots, layout.group]
    return layout.group
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
    if (Boolean(this.requireTerminalGroup(terminalGroupId).isCollapsed) === isCollapsed) return
    const group = { ...this.requireTerminalGroup(terminalGroupId), isCollapsed }
    const layout = isCollapsed
      ? { blocks: this.blockSnapshots, group }
      : expandTerminalGroupLayout(group, this.blockSnapshots, this.terminalConnectionSnapshots)
    this.blockSnapshots = layout.blocks
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map((candidate) =>
      candidate.id === terminalGroupId ? layout.group : candidate
    )
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
      currentGroup.id === terminalGroupId ? { ...currentGroup, position } : currentGroup
    )
  }

  addTerminalToGroup(terminalGroupId: string, blockId: string): void {
    this.moveTerminalWorkflowToGroup(blockId, terminalGroupId)
  }

  removeTerminalFromGroup(terminalGroupId: string, blockId: string): void {
    const group = this.requireTerminalGroup(terminalGroupId)
    if (!group.memberBlockIds.includes(blockId)) {
      throw createExpectedAppError(
        'TERMINAL_BLOCK_NOT_IN_GROUP',
        'Terminal block does not belong to the group.'
      )
    }
    this.moveTerminalWorkflowToGroup(blockId, null)
  }

  moveTerminalWorkflowToGroup(
    blockId: string,
    terminalGroupId: string | null,
    position?: BlockPositionSnapshot,
    scope?: 'terminal' | 'workflow',
    expectedBlockIds?: readonly string[]
  ): readonly string[] {
    this.requireTerminalBlock(blockId)
    if (terminalGroupId) this.requireTerminalGroup(terminalGroupId)

    const movedBlockIds = new Set(
      scope === 'terminal'
        ? [blockId]
        : expandTerminalGroupMemberIdsToCompleteWorkflows(
            this.blockSnapshots,
            this.terminalConnectionSnapshots,
            [blockId]
          )
    )
    const sourceGroup = this.findTerminalGroupByBlockId(blockId)
    if (
      expectedBlockIds &&
      (new Set(expectedBlockIds).size !== movedBlockIds.size ||
        expectedBlockIds.some((id) => !movedBlockIds.has(id)))
    ) {
      throw createExpectedAppError(
        'TERMINAL_SCOPE_MOVE_STALE',
        'Terminal workflow scope changed before it could be moved.'
      )
    }

    const result = applyTerminalGroupMembershipMove({
      blockId,
      blocks: this.blockSnapshots,
      connections: this.terminalConnectionSnapshots,
      groups: this.terminalGroupSnapshots,
      movedBlockIds,
      position,
      sourceTerminalGroupId: sourceGroup?.id ?? null,
      targetTerminalGroupId: terminalGroupId
    })
    this.blockSnapshots = result.blocks
    this.terminalGroupSnapshots = result.groups
    return Object.freeze([...movedBlockIds])
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
      ...(this.templateApplications.snapshot().length
        ? { templateApplications: this.templateApplications.snapshot() }
        : {}),
      id: this.id,
      projectId: this.projectId,
      workspaceId: this.workspaceId,
      viewport: this.viewportSnapshot,
      blocks: this.blockSnapshots,
      connections: this.terminalConnectionSnapshots,
      terminalGroups: this.terminalGroupSnapshots,
      quickExecutionSlots: this.quickExecutionSlotSnapshots
    }
  }

  private ensureTerminalGroupMembersAreAvailable(
    memberBlockIds: readonly string[],
    allowedTerminalGroupId?: string
  ): void {
    for (const memberBlockId of memberBlockIds) {
      this.requireTerminalBlock(memberBlockId)

      const existingGroup = this.findTerminalGroupByBlockId(memberBlockId)
      if (existingGroup && existingGroup.id !== allowedTerminalGroupId) {
        throw createExpectedAppError(
          'TERMINAL_BLOCK_ALREADY_GROUPED',
          'Terminal block already belongs to a group.'
        )
      }
    }
  }

  private reflowTerminalGroups(affectedBlockIds: readonly string[]): void {
    const groups = this.terminalGroupSnapshots.filter((group) =>
      group.memberBlockIds.some((id) => affectedBlockIds.includes(id))
    )
    const layout = layoutTerminalGroups(
      groups,
      this.blockSnapshots,
      this.terminalConnectionSnapshots
    )
    this.blockSnapshots = layout.blocks
    this.terminalGroupSnapshots = this.terminalGroupSnapshots.map(
      (group) => layout.groups.find((updated) => updated.id === group.id) ?? group
    )
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
