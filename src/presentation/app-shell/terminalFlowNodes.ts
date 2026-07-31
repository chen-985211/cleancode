import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import {
  resolveTerminalGroupDropFeedback,
  type TerminalGroupDropAction
} from './terminalGroupDropTarget'
import type { AgentApprovalNodeIntent } from './agentToolApprovalTypes'
import { createCanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import {
  createIdleTerminalState,
  type TerminalDefinitionInput,
  type TerminalDimensions,
  type TerminalFlowNode,
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
  readonly onToggleRetention?: (block: TerminalBlockSnapshot) => void
  readonly onDelete: (block: TerminalBlockSnapshot) => void
  readonly onUpdateDefinition: (
    block: TerminalBlockSnapshot,
    definition: TerminalDefinitionInput
  ) => Promise<void>
  readonly onCopyServiceEndpoint?: TerminalFlowNode['data']['onCopyServiceEndpoint']
  readonly onOpenServiceEndpoint?: TerminalFlowNode['data']['onOpenServiceEndpoint']
  readonly onLocateManagedServiceOwner?: TerminalFlowNode['data']['onLocateManagedServiceOwner']
  readonly onDismissPortConflict?: TerminalFlowNode['data']['onDismissPortConflict']
  readonly onRunFromHere?: TerminalFlowNode['data']['onRunFromHere']
  readonly onStopWorkflow?: TerminalFlowNode['data']['onStopWorkflow']
  readonly onViewIdentityStale?: TerminalFlowNode['data']['onViewIdentityStale']
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onPaste?: (block: TerminalBlockSnapshot, input: string) => Promise<void>
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
  readonly approvalNodeIntents?: ReadonlyMap<string, AgentApprovalNodeIntent>
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedTerminalBlockId?: string | null
  readonly selectedTerminalBlockIds?: readonly string[]
  readonly selectedTerminalGroupId?: string | null
  readonly selectedUngroupedTerminalBlockIds?: readonly string[]
  readonly isTerminalGroupSelectionMode?: boolean
  readonly terminalGroupDropAction?: TerminalGroupDropAction
  readonly hoveredTerminalBlockId: string | null
  readonly activeWorkflowRootBlockIds?: readonly string[]
  readonly isStoppingWorkflow?: boolean
  readonly launchCommandEditRequest?: {
    readonly blockId: string
    readonly requestId: number
  } | null
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: TerminalFlowNodeHandlers & Partial<TerminalGroupFlowNodeHandlers>
  readonly workflowNodeStatuses?: Readonly<Record<string, WorkflowRunNodeStatus>>
}

export function createTerminalFlowNodes({
  approvalNodeIntents = new Map(),
  graph,
  selectedTerminalBlockId,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  selectedUngroupedTerminalBlockIds = [],
  isTerminalGroupSelectionMode = false,
  terminalGroupDropAction = { type: 'none' },
  hoveredTerminalBlockId,
  activeWorkflowRootBlockIds = [],
  isStoppingWorkflow = false,
  launchCommandEditRequest = null,
  terminalStates,
  handlers,
  workflowNodeStatuses = {}
}: CreateTerminalFlowNodesInput): WorkbenchFlowNode[] {
  const activeWorkflowRootIds = new Set(activeWorkflowRootBlockIds)
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
      approvalIntent: approvalNodeIntents.get(group.id),
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
        approvalIntent: approvalNodeIntents.get(block.id),
        block,
        projectId: graph!.projectId,
        workspaceId: graph!.workspaceId,
        canSelectForTerminalGroup: isTerminalGroupSelectionMode || !groupedMemberIds.has(block.id),
        handlers,
        isNavigationHighlighted: hoveredTerminalBlockId === block.id,
        isActiveWorkflowRoot: activeWorkflowRootIds.has(block.id),
        isStoppingWorkflow,
        launchCommandEditRequestId:
          launchCommandEditRequest?.blockId === block.id
            ? launchCommandEditRequest.requestId
            : undefined,
        isSelected: selectedBlockIds.has(block.id),
        isTerminalGroupSelectionMode,
        terminalStates,
        workflowStatus: workflowNodeStatuses[block.id]
      })
    )

  return [...groupNodes, ...terminalNodes]
}

interface CreateTerminalFlowNodeInput {
  readonly approvalIntent?: AgentApprovalNodeIntent
  readonly block: TerminalBlockSnapshot
  readonly projectId: string
  readonly workspaceId: string
  readonly terminalStates: Record<string, TerminalViewState>
  readonly handlers: TerminalFlowNodeHandlers
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly launchCommandEditRequestId?: number
  readonly workflowStatus?: WorkflowRunNodeStatus
}

function createTerminalFlowNode({
  approvalIntent,
  block,
  projectId,
  workspaceId,
  terminalStates,
  handlers,
  isSelected,
  isTerminalGroupSelectionMode,
  canSelectForTerminalGroup,
  isNavigationHighlighted,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  launchCommandEditRequestId,
  workflowStatus
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
      identity: createCanvasObjectIdentity({
        projectId,
        workspaceId,
        objectKind: 'terminal',
        objectId: block.id
      }),
      approvalIntent,
      block,
      session: terminalStates[block.id] ?? createIdleTerminalState(),
      isSelected,
      isTerminalGroupSelectionMode,
      canSelectForTerminalGroup,
      isNavigationHighlighted,
      isActiveWorkflowRoot,
      isStoppingWorkflow,
      launchCommandEditRequestId,
      workflowStatus,
      ...handlers,
      onSelect: (additive) => handlers.onSelect?.(block, additive)
    }
  }
}

interface CreateTerminalGroupFlowNodeInput {
  readonly approvalIntent?: AgentApprovalNodeIntent
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
  approvalIntent,
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
      identity: createCanvasObjectIdentity({
        projectId: graph!.projectId,
        workspaceId: graph!.workspaceId,
        objectKind: 'terminal-group',
        objectId: group.id
      }),
      approvalIntent,
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

function noopTerminalGroupAction(): void {}

async function noopTerminalGroupPromiseAction(): Promise<void> {}

async function noopUpdateGroupMetadata(): Promise<void> {}

async function noopToggleGroupCollapsed(): Promise<void> {}

async function noopRemoveTerminalFromGroup(): Promise<void> {}

export function createCollapsedTerminalGroupSize(memberCount: number): {
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
