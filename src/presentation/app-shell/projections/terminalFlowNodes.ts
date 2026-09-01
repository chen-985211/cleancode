import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkflowRunNodeStatus } from '../../../contexts/run/application/dto/WorkflowRunSnapshot'
import {
  resolveTerminalGroupDropFeedback,
  type TerminalGroupDropAction
} from '../../../contexts/block-graph/presentation/view-models/terminalGroupDropTarget'
import type { AgentApprovalNodeIntent } from '../workbench/nodes/agent/agentToolApprovalTypes'
import {
  createTerminalStateStore,
  type TerminalStateStore
} from '../../../contexts/run/presentation/view-models/terminalStateStore'
import type { TerminalWorkflowBuildPresentation } from '../coordinators/useTerminalWorkflowBuildChoreography'
import { createCanvasObjectIdentity } from '../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { TerminalDimensions } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { TerminalFlowNode } from '../types/terminalFlowNode'
import type { TerminalGroupFlowNode } from '../types/terminalGroupFlowNode'
import type { WorkbenchNodeLayoutInput } from '../types/workbenchNodeLayout'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import type { UpdateTerminalGroupMetadataInput } from '../../../contexts/block-graph/domain/aggregates/BlockGraphTypes'
import type { TerminalDefinitionInput } from '../../../contexts/block-graph/presentation/view-models/TerminalDefinitionPresentationTypes'
import type { TerminalViewState } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'

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
  readonly onStopWorkflow?: (runId: string) => void
  readonly onViewIdentityStale?: TerminalFlowNode['data']['onViewIdentityStale']
  readonly onInput: (block: TerminalBlockSnapshot, input: string) => void
  readonly onPaste?: (block: TerminalBlockSnapshot, input: string) => Promise<void>
  readonly onResize: (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => void
  readonly onResizeBlock: (
    block: TerminalBlockSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelect?: (block: TerminalBlockSnapshot) => void
  readonly onToggleTerminalGroupCandidate: (block: TerminalBlockSnapshot) => void
}

interface TerminalGroupFlowNodeHandlers {
  readonly onStartGroup: (group: TerminalGroupSnapshot) => void
  readonly onStopGroup: (group: TerminalGroupSnapshot) => void
  readonly onRestartGroup: (group: TerminalGroupSnapshot) => void
  readonly onUpdateGroupMetadata: (
    group: TerminalGroupSnapshot,
    metadata: UpdateTerminalGroupMetadataInput
  ) => Promise<void>
  readonly onToggleGroupCollapsed: (
    group: TerminalGroupSnapshot,
    isCollapsed: boolean
  ) => Promise<void>
  readonly onEditGroup: (group: TerminalGroupSnapshot) => void
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
  readonly editingTerminalGroupId?: string | null
  readonly terminalGroupDropAction?: TerminalGroupDropAction
  readonly hoveredTerminalBlockId: string | null
  readonly activeWorkflowRunIdByRootBlockId?: Readonly<Record<string, string>>
  readonly stoppingWorkflowRunIds?: readonly string[]
  readonly launchCommandEditRequest?: {
    readonly blockId: string
    readonly requestId: number
  } | null
  readonly terminalStates?: Record<string, TerminalViewState>
  readonly terminalStateStore?: TerminalStateStore
  readonly handlers: TerminalFlowNodeHandlers & Partial<TerminalGroupFlowNodeHandlers>
  readonly workflowNodeStatuses?: Readonly<Record<string, WorkflowRunNodeStatus>>
  readonly workflowBuildPresentation?: TerminalWorkflowBuildPresentation | null
  readonly includeCollapsedMembers?: boolean
}

export function createTerminalFlowNodes({
  approvalNodeIntents = new Map(),
  graph,
  selectedTerminalBlockId,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  editingTerminalGroupId,
  terminalGroupDropAction = { type: 'none' },
  hoveredTerminalBlockId,
  activeWorkflowRunIdByRootBlockId = {},
  stoppingWorkflowRunIds = [],
  launchCommandEditRequest = null,
  terminalStates = {},
  terminalStateStore: providedTerminalStateStore,
  handlers,
  workflowNodeStatuses = {},
  workflowBuildPresentation = null,
  includeCollapsedMembers = false
}: CreateTerminalFlowNodesInput): WorkbenchFlowNode[] {
  const terminalStateStore = providedTerminalStateStore ?? createTerminalStateStore(terminalStates)
  const stoppingWorkflowRunIdSet = new Set(stoppingWorkflowRunIds)
  const selectedBlockIds = new Set(
    selectedTerminalBlockIds ?? (selectedTerminalBlockId ? [selectedTerminalBlockId] : [])
  )
  const collapsedGroupMemberIds = new Set(
    (graph?.terminalGroups ?? [])
      .filter((group) => group.isCollapsed)
      .flatMap((group) => group.memberBlockIds)
  )
  const groupNodes = (graph?.terminalGroups ?? []).map((group) =>
    createTerminalGroupFlowNode({
      approvalIntent: approvalNodeIntents.get(group.id),
      graph,
      group,
      handlers,
      selectedTerminalGroupId: selectedTerminalGroupId ?? null,
      isEditing: editingTerminalGroupId === group.id,
      terminalGroupDropAction,
      terminalStateStore,
      workflowBuildPresentation
    })
  )
  const terminalNodes = (graph?.blocks ?? [])
    .filter((block) => includeCollapsedMembers || !collapsedGroupMemberIds.has(block.id))
    .map((block) => {
      const activeWorkflowRunId = activeWorkflowRunIdByRootBlockId[block.id]
      return createTerminalFlowNode({
        approvalIntent: approvalNodeIntents.get(block.id),
        activeWorkflowRunId,
        block,
        projectId: graph!.projectId,
        workspaceId: graph!.workspaceId,
        canSelectForTerminalGroup: false,
        handlers,
        isNavigationHighlighted: hoveredTerminalBlockId === block.id,
        isActiveWorkflowRoot: Boolean(activeWorkflowRunId),
        isStoppingWorkflow: activeWorkflowRunId
          ? stoppingWorkflowRunIdSet.has(activeWorkflowRunId)
          : false,
        launchCommandEditRequestId:
          launchCommandEditRequest?.blockId === block.id
            ? launchCommandEditRequest.requestId
            : undefined,
        isSelected: selectedBlockIds.has(block.id),
        isTerminalGroupSelectionMode: false,
        terminalStateStore,
        workflowBuildPresentation,
        workflowStatus: workflowNodeStatuses[block.id]
      })
    })

  return [...groupNodes, ...terminalNodes]
}

interface CreateTerminalFlowNodeInput {
  readonly activeWorkflowRunId?: string
  readonly approvalIntent?: AgentApprovalNodeIntent
  readonly block: TerminalBlockSnapshot
  readonly projectId: string
  readonly workspaceId: string
  readonly terminalStateStore: TerminalStateStore
  readonly handlers: TerminalFlowNodeHandlers
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly launchCommandEditRequestId?: number
  readonly workflowStatus?: WorkflowRunNodeStatus
  readonly workflowBuildPresentation: TerminalWorkflowBuildPresentation | null
}

function createTerminalFlowNode({
  approvalIntent,
  activeWorkflowRunId,
  block,
  projectId,
  workspaceId,
  terminalStateStore,
  handlers,
  isSelected,
  isTerminalGroupSelectionMode,
  canSelectForTerminalGroup,
  isNavigationHighlighted,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  launchCommandEditRequestId,
  workflowStatus,
  workflowBuildPresentation
}: CreateTerminalFlowNodeInput): TerminalFlowNode {
  const buildInitialPosition = workflowBuildPresentation?.initialPositionsByBlockId?.get(block.id)
  const objectPresence = resolveWorkflowBuildObjectPresence(workflowBuildPresentation, block.id, {
    enteringIds: workflowBuildPresentation?.enteringTerminalBlockIds,
    pendingIds: workflowBuildPresentation?.pendingTerminalBlockIds
  })
  return {
    id: block.id,
    type: 'terminal',
    position: buildInitialPosition ?? block.position,
    selectable: false,
    selected: isSelected,
    zIndex: 3,
    style: {
      width: block.size.width,
      height: block.size.height
    },
    className: undefined,
    data: {
      identity: createCanvasObjectIdentity({
        projectId,
        workspaceId,
        objectKind: 'terminal',
        objectId: block.id
      }),
      approvalIntent,
      block,
      session: terminalStateStore.getState(block.id),
      terminalStateStore,
      isSelected,
      isTerminalGroupSelectionMode,
      canSelectForTerminalGroup,
      isNavigationHighlighted,
      isActiveWorkflowRoot,
      isStoppingWorkflow,
      launchCommandEditRequestId,
      isObjectLayoutChoreographed: workflowBuildPresentation?.terminalBlockIds.has(block.id),
      objectPresence,
      workflowStatus,
      ...handlers,
      onStopWorkflow:
        activeWorkflowRunId && handlers.onStopWorkflow
          ? () => handlers.onStopWorkflow?.(activeWorkflowRunId)
          : undefined
    }
  }
}

interface CreateTerminalGroupFlowNodeInput {
  readonly approvalIntent?: AgentApprovalNodeIntent
  readonly group: TerminalGroupSnapshot
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedTerminalGroupId: string | null
  readonly isEditing: boolean
  readonly terminalGroupDropAction: TerminalGroupDropAction
  readonly terminalStateStore: TerminalStateStore
  readonly handlers: Partial<TerminalGroupFlowNodeHandlers>
  readonly workflowBuildPresentation: TerminalWorkflowBuildPresentation | null
}

function createTerminalGroupFlowNode({
  approvalIntent,
  group,
  graph,
  selectedTerminalGroupId,
  isEditing,
  terminalGroupDropAction,
  terminalStateStore,
  handlers,
  workflowBuildPresentation
}: CreateTerminalGroupFlowNodeInput): TerminalGroupFlowNode {
  const memberBlocks = (graph?.blocks ?? []).filter((block) =>
    group.memberBlockIds.includes(block.id)
  )
  const size = group.isCollapsed
    ? createCollapsedTerminalGroupSize(memberBlocks.length)
    : group.size
  const objectPresence = resolveWorkflowBuildObjectPresence(workflowBuildPresentation, group.id, {
    enteringIds: workflowBuildPresentation?.enteringTerminalGroupIds,
    pendingIds: workflowBuildPresentation?.pendingTerminalGroupIds
  })

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
    className: undefined,
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
        memberBlocks.map((block) => [block.id, terminalStateStore.getState(block.id)])
      ),
      terminalStateStore,
      isEditing,
      isSelected: selectedTerminalGroupId === group.id,
      isObjectLayoutChoreographed: workflowBuildPresentation?.terminalGroupIds.has(group.id),
      objectPresence,
      dropFeedback: resolveTerminalGroupDropFeedback(group.id, terminalGroupDropAction),
      onStartGroup: handlers.onStartGroup ?? noopTerminalGroupAction,
      onStopGroup: handlers.onStopGroup ?? noopTerminalGroupAction,
      onRestartGroup: handlers.onRestartGroup ?? noopTerminalGroupAction,
      onUpdateGroupMetadata: handlers.onUpdateGroupMetadata ?? noopUpdateGroupMetadata,
      onToggleGroupCollapsed: handlers.onToggleGroupCollapsed ?? noopToggleGroupCollapsed,
      onEditGroup: handlers.onEditGroup ?? noopTerminalGroupAction,
      onRemoveTerminalFromGroup: handlers.onRemoveTerminalFromGroup ?? noopRemoveTerminalFromGroup,
      onDissolveGroup: handlers.onDissolveGroup ?? noopTerminalGroupPromiseAction
    }
  }
}

function resolveWorkflowBuildObjectPresence(
  presentation: TerminalWorkflowBuildPresentation | null,
  nodeId: string,
  stages: {
    readonly enteringIds?: ReadonlySet<string>
    readonly pendingIds?: ReadonlySet<string>
  }
) {
  const phase = stages.pendingIds?.has(nodeId)
    ? ('pending' as const)
    : stages.enteringIds?.has(nodeId)
      ? ('entering' as const)
      : null

  return phase && presentation ? { id: `${presentation.operationId}:${nodeId}`, phase } : undefined
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
