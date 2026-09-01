import type { Edge, NodeChange, NodeTypes, ReactFlowInstance } from '@xyflow/react'
import type { MouseEvent, MutableRefObject, Ref } from 'react'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import type {
  BatchTerminalRemovalTargetSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import type { AppNotificationController } from '../shared/notifications/appNotifications'
import type { AgentToolApprovalViewState } from './agentToolApprovalTypes'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import type { ShortcutPlatform } from './applicationShortcuts'
import type { MinimapFlowNode, WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import type { InitialWorkbenchLoadPhase } from './useInitialWorkbenchLoad'
import type { useTerminalWorkflow } from './useTerminalWorkflow'
import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'
import type { ArrangeCanvasSelectionHandler } from './WorkbenchCanvasBottomControls'
import type { MinimapNodeInteractionContextValue } from './minimapInteraction'
import type { MoveCanvasStackHandler } from './useWorkbenchCanvasArrangement'
import type { TerminalZoomRasterCanvasCoordinator } from './useWorkbenchCanvasViewportRestoration'
import type { WorkbenchNodeStore } from './workbenchNodeStore'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

export interface WorkbenchCanvasProps {
  readonly agentProviders?: readonly CreatableAgentProviderSnapshot[]
  readonly approvalIntents?: readonly AgentToolApprovalViewState[]
  readonly isDesktopRuntime: boolean
  readonly initialWorkbenchLoadPhase?: InitialWorkbenchLoadPhase
  readonly isCreatingAgent?: boolean
  readonly isAgentProviderDiscoveryPending?: boolean
  readonly defaultAgentProviderId?: string | null
  readonly terminalRuntimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly notifications?: AppNotificationController
  readonly nodeStore: WorkbenchNodeStore
  readonly nodeTypes: NodeTypes
  readonly canvasSizeRef?: MutableRefObject<{ width: number; height: number }>
  readonly canvasLeftInset?: number
  readonly centerMotionRef?: Ref<HTMLDivElement>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly spatialMotionRef?: Ref<HTMLDivElement>
  readonly statusbarMotionRef?: Ref<HTMLElement>
  readonly minimapNodeInteraction: MinimapNodeInteractionContextValue
  readonly reduceVisualNoise?: boolean
  readonly terminalWorkflow?: ReturnType<typeof useTerminalWorkflow>
  readonly terminalWorkflowBuildPresentation?: TerminalWorkflowBuildPresentation | null
  readonly shortcutTooltips: Partial<ApplicationShortcutTooltipLabels> &
    Pick<
      ApplicationShortcutTooltipLabels,
      | 'createAgent'
      | 'createTerminal'
      | 'fitCanvas'
      | 'groupTerminals'
      | 'toggleMinimap'
      | 'zoomCanvasIn'
      | 'zoomCanvasOut'
    >
  readonly shortcutPlatform?: ShortcutPlatform
  readonly placementTemplate?: BlockTemplateSnapshot
  readonly onPlaceBlockTemplate?: (origin: {
    readonly x: number
    readonly y: number
  }) => Promise<void> | void
  readonly onCancelBlockTemplatePlacement?: () => void
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly isCanvasArrangementPending?: boolean
  readonly onArrangeCanvasSelection?: ArrangeCanvasSelectionHandler
  readonly onMoveCanvasStack?: MoveCanvasStackHandler
  readonly onDeleteTerminalScope?: (
    target: BatchTerminalRemovalTargetSnapshot
  ) => Promise<void> | void
  readonly onAddQuickExecutionTarget?: (
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onBindQuickExecutionSlot?: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClearQuickExecutionSlot?: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onReorderQuickExecutionSlots?: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly onQuickExecutionNodeDrop?: (
    target: QuickExecutionTargetSnapshot,
    node: WorkbenchFlowNode
  ) => Promise<void> | void
  readonly onQuickExecutionDragPreview?: () => void
  readonly isMinimapCollapsed: boolean
  readonly onToggleMinimap: () => void
  readonly onZoomCanvasIn: () => void
  readonly onZoomCanvasOut: () => void
  readonly onFitCanvas: () => void
  readonly onOpenProject?: () => void
  readonly onRetryInitialWorkbenchLoad?: () => void
  readonly onCreateTerminalBlock: (options?: {
    readonly position?: { readonly x: number; readonly y: number }
    readonly terminalGroupId?: string
  }) => void
  readonly onCreateWorkspaceAgent: (providerId?: string) => void
  readonly onOpenAgentSettings?: () => void
  readonly onSelectDefaultAgentProvider?: (providerId: string) => void
  readonly onCreateTerminalGroup: (position: { readonly x: number; readonly y: number }) => void
  readonly onBeginTerminalGroupSelection?: () => void
  readonly onCancelTerminalGroupSelection: () => void
  readonly editingTerminalGroupId?: string | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection?: boolean
  readonly canCreateTerminalGroup?: boolean
  readonly onNodesChange: (changes: NodeChange<WorkbenchFlowNode>[]) => void
  readonly onNodeClick: (event: MouseEvent, node: WorkbenchFlowNode) => void
  readonly onPaneClick: () => void
  readonly onNodeDrag: (event: globalThis.MouseEvent | TouchEvent, node: WorkbenchFlowNode) => void
  readonly onNodeDragStart: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode,
    protectedNodeIds?: readonly string[]
  ) => void
  readonly onCancelNodeDrag?: (nodeId: string) => void
  readonly onNodeDragStop: (
    event: globalThis.MouseEvent | TouchEvent,
    node: WorkbenchFlowNode
  ) => void
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly onViewportInteractionStart?: () => void
  readonly terminalZoomRasterCoordinator?: TerminalZoomRasterCanvasCoordinator
  readonly onMinimapNodeClick: (blockId: string) => void
  readonly getMiniMapNodeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeStrokeColor: (node: MinimapFlowNode) => string
  readonly getMiniMapNodeClassName: (node: MinimapFlowNode) => string
}
