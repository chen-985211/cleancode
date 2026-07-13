import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalGroupDropAction } from './terminalGroupDropTarget'
import {
  createIdleTerminalState,
  type TerminalBlockMetadataInput,
  type TerminalDimensions,
  type TerminalFlowNode,
  type TerminalGroupDropFeedback,
  type TerminalGroupFlowNode,
  type TerminalGroupMetadataInput,
  type TerminalViewState,
  type WorkbenchNodeLayoutInput,
  type WorkbenchFlowNode,
  type WorkbenchSnapshot
} from './types'

const collapsedTerminalGroupWidth = 360
const collapsedTerminalGroupIdentityHeight = 44
const collapsedTerminalGroupToolbarHeight = 44
const collapsedTerminalGroupMemberRowHeight = 36

interface TerminalFlowNodeHandlers {
  readonly onStart: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onStop: (block: TerminalBlockSnapshot) => void
  readonly onQuickLaunch: (block: TerminalBlockSnapshot) => void
  readonly onRestart: (block: TerminalBlockSnapshot) => void
  readonly onDelete: (block: TerminalBlockSnapshot) => void
  readonly onUpdateMetadata: (
    block: TerminalBlockSnapshot,
    metadata: TerminalBlockMetadataInput
  ) => Promise<void>
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onResize: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onResizeBlock: (
    block: TerminalBlockSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelect?: (block: TerminalBlockSnapshot, additive: boolean) => void
  readonly onToggleTerminalGroupCandidate: (block: TerminalBlockSnapshot) => void
}

interface TerminalGroupFlowNodeHandlers {
  readonly onStartGroup: (group: TerminalGroupSnapshot) => void
  readonly onStopGroup: (group: TerminalGroupSnapshot) => void
  readonly onRestartGroup: (group: TerminalGroupSnapshot) => void
  readonly onUpdateGroupMetadata: (
    group: TerminalGroupSnapshot,
    metadata: TerminalGroupMetadataInput
  ) => Promise<void>
  readonly onToggleGroupCollapsed: (
    group: TerminalGroupSnapshot,
    isCollapsed: boolean
  ) => Promise<void>
  readonly onAddSelectedTerminalsToGroup: (group: TerminalGroupSnapshot) => Promise<void>
  readonly onRemoveSelectedTerminalsFromGroup: (group: TerminalGroupSnapshot) => Promise<void>
  readonly onRemoveTerminalFromGroup: (
    group: TerminalGroupSnapshot,
    block: TerminalBlockSnapshot
  ) => Promise<void>
  readonly onDissolveGroup: (group: TerminalGroupSnapshot) => Promise<void>
}

interface CreateTerminalFlowNodesInput {
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedTerminalBlockId?: string | null
  readonly selectedTerminalBlockIds?: readonly string[]
  readonly selectedTerminalGroupId?: string | null
  readonly selectedUngroupedTerminalBlockIds?: readonly string[]
  readonly isTerminalGroupSelectionMode?: boolean
  readonly terminalGroupDropAction?: TerminalGroupDropAction
  readonly hoveredTerminalBlockId: string | null
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: TerminalFlowNodeHandlers & Partial<TerminalGroupFlowNodeHandlers>
}

export function createTerminalFlowNodes({
  graph,
  selectedTerminalBlockId,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  selectedUngroupedTerminalBlockIds = [],
  isTerminalGroupSelectionMode = false,
  terminalGroupDropAction = { type: 'none' },
  hoveredTerminalBlockId,
  terminalStates,
  handlers
}: CreateTerminalFlowNodesInput): WorkbenchFlowNode[] {
  const selectedBlockIds = new Set(
    selectedTerminalBlockIds ?? (selectedTerminalBlockId ? [selectedTerminalBlockId] : [])
  )
  const collapsedGroupMemberIds = new Set(
    (graph?.terminalGroups ?? [])
      .filter((group) => group.isCollapsed)
      .flatMap((group) => group.memberBlockIds)
  )
  const groupedMemberIds = new Set(
    (graph?.terminalGroups ?? []).flatMap((group) => group.memberBlockIds)
  )
  const groupNodes = (graph?.terminalGroups ?? []).map((group) =>
    createTerminalGroupFlowNode({
      graph,
      group,
      handlers,
      selectedBlockIds,
      selectedTerminalGroupId: selectedTerminalGroupId ?? null,
      selectedUngroupedTerminalBlockIds,
      terminalGroupDropAction,
      terminalStates
    })
  )
  const terminalNodes = (graph?.blocks ?? [])
    .filter((block) => !collapsedGroupMemberIds.has(block.id))
    .map((block) =>
      createTerminalFlowNode({
        block,
        canSelectForTerminalGroup: isTerminalGroupSelectionMode || !groupedMemberIds.has(block.id),
        handlers,
        isNavigationHighlighted: hoveredTerminalBlockId === block.id,
        isSelected: selectedBlockIds.has(block.id),
        isTerminalGroupSelectionMode,
        terminalStates
      })
    )

  return [...groupNodes, ...terminalNodes]
}

interface CreateTerminalFlowNodeInput {
  readonly block: TerminalBlockSnapshot
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: TerminalFlowNodeHandlers
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
}

function createTerminalFlowNode({
  block,
  terminalStates,
  handlers,
  isSelected,
  isTerminalGroupSelectionMode,
  canSelectForTerminalGroup,
  isNavigationHighlighted
}: CreateTerminalFlowNodeInput): TerminalFlowNode {
  return {
    id: block.id,
    type: 'terminal',
    position: block.position,
    selectable: false,
    selected: isSelected,
    zIndex: 3,
    style: {
      width: block.size.width,
      height: block.size.height
    },
    data: {
      block,
      session: terminalStates[block.id] ?? createIdleTerminalState(),
      isSelected,
      isTerminalGroupSelectionMode,
      canSelectForTerminalGroup,
      isNavigationHighlighted,
      ...handlers,
      onSelect: (additive) => handlers.onSelect?.(block, additive)
    }
  }
}

interface CreateTerminalGroupFlowNodeInput {
  readonly group: TerminalGroupSnapshot
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedBlockIds: ReadonlySet<string>
  readonly selectedTerminalGroupId: string | null
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly terminalGroupDropAction: TerminalGroupDropAction
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: Partial<TerminalGroupFlowNodeHandlers>
}

function createTerminalGroupFlowNode({
  group,
  graph,
  selectedBlockIds,
  selectedTerminalGroupId,
  selectedUngroupedTerminalBlockIds,
  terminalGroupDropAction,
  terminalStates,
  handlers
}: CreateTerminalGroupFlowNodeInput): TerminalGroupFlowNode {
  const memberBlocks = (graph?.blocks ?? []).filter((block) =>
    group.memberBlockIds.includes(block.id)
  )
  const size = group.isCollapsed
    ? createCollapsedTerminalGroupSize(memberBlocks.length)
    : group.size

  return {
    id: group.id,
    type: 'terminalGroup',
    position: group.position,
    selectable: false,
    selected: selectedTerminalGroupId === group.id,
    zIndex: 1,
    style: {
      width: size.width,
      height: size.height
    },
    data: {
      group,
      memberBlocks,
      memberStates: Object.fromEntries(
        memberBlocks.map((block) => [
          block.id,
          terminalStates[block.id] ?? createIdleTerminalState()
        ])
      ),
      selectedUngroupedTerminalBlockIds,
      selectedMemberBlockIds: group.memberBlockIds.filter((blockId) =>
        selectedBlockIds.has(blockId)
      ),
      isSelected: selectedTerminalGroupId === group.id,
      dropFeedback: resolveTerminalGroupDropFeedback(group.id, terminalGroupDropAction),
      onStartGroup: handlers.onStartGroup ?? noopTerminalGroupAction,
      onStopGroup: handlers.onStopGroup ?? noopTerminalGroupAction,
      onRestartGroup: handlers.onRestartGroup ?? noopTerminalGroupAction,
      onUpdateGroupMetadata: handlers.onUpdateGroupMetadata ?? noopUpdateGroupMetadata,
      onToggleGroupCollapsed: handlers.onToggleGroupCollapsed ?? noopToggleGroupCollapsed,
      onAddSelectedTerminalsToGroup:
        handlers.onAddSelectedTerminalsToGroup ?? noopTerminalGroupPromiseAction,
      onRemoveSelectedTerminalsFromGroup:
        handlers.onRemoveSelectedTerminalsFromGroup ?? noopTerminalGroupPromiseAction,
      onRemoveTerminalFromGroup: handlers.onRemoveTerminalFromGroup ?? noopRemoveTerminalFromGroup,
      onDissolveGroup: handlers.onDissolveGroup ?? noopTerminalGroupPromiseAction
    }
  }
}

function resolveTerminalGroupDropFeedback(
  terminalGroupId: string,
  action: TerminalGroupDropAction
): TerminalGroupDropFeedback | null {
  if (action.type === 'join-group' && action.terminalGroupId === terminalGroupId) {
    return 'join'
  }

  if (action.type === 'leave-group' && action.terminalGroupId === terminalGroupId) {
    return action.willDissolveGroup ? 'dissolve' : 'leave'
  }

  return null
}

function noopTerminalGroupAction(): void {}

async function noopTerminalGroupPromiseAction(): Promise<void> {}

async function noopUpdateGroupMetadata(): Promise<void> {}

async function noopToggleGroupCollapsed(): Promise<void> {}

async function noopRemoveTerminalFromGroup(): Promise<void> {}

function createCollapsedTerminalGroupSize(memberCount: number): {
  readonly width: number
  readonly height: number
} {
  const visibleMemberCount = Math.max(memberCount, 0)
  const memberListHeight = visibleMemberCount * collapsedTerminalGroupMemberRowHeight

  return {
    width: collapsedTerminalGroupWidth,
    height:
      collapsedTerminalGroupIdentityHeight + collapsedTerminalGroupToolbarHeight + memberListHeight
  }
}
