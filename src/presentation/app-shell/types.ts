import type { Node } from '@xyflow/react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { AgentApprovalNodeIntent, AgentToolApprovalController } from './agentToolApprovalTypes'

import {
  type BlockGraphSnapshot,
  minimumTerminalBlockSize,
  type TerminalBlockSnapshot,
  type TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'
import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from '../../contexts/run/application/dto/TerminalRunEvent'
import type {
  TerminalRecoveryKind,
  TerminalRetentionPolicy,
  TerminalSessionKind,
  TerminalSessionStatus
} from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalSourceTheme } from '../../contexts/run/domain/aggregates/TerminalSession'
import type { TerminalDimensions } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalExecutionConfigSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'

export type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from '../../contexts/run/application/dto/TerminalRunEvent'
export type { TerminalDimensions } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'

export interface WorkbenchSnapshot {
  readonly agents?: readonly WorkspaceAgentSnapshot[]
  readonly canvasArrangement?: CanvasArrangementSnapshot
  readonly isCurrentProject?: boolean
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}

export interface TerminalViewState {
  readonly sessionId: string | null
  readonly status: TerminalSessionStatus
  readonly output: string
  readonly autoStartStatus?: 'failed' | 'idle' | 'pending' | 'succeeded'
  readonly autoStartRuntimeEpoch?: number
  readonly sessionKind?: TerminalSessionKind | null
  readonly retentionPolicy?: TerminalRetentionPolicy
  readonly recoveryKind?: TerminalRecoveryKind
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly isRecoveryPending?: boolean
  readonly runIdentity?: TerminalRunIdentity | null
  readonly actualEndpoint?: TerminalServiceEndpoint | null
  readonly portConflict?: TerminalServicePortConflict | null
  readonly servicePortState?: 'bound' | 'releasing' | 'quarantined' | null
}

export interface TerminalStateStore {
  readonly getDiagnostics: () => {
    readonly listenerCount: number
    readonly stateCount: number
  }
  readonly getState: (terminalId: string) => TerminalViewState
  readonly replaceStates: (states: Readonly<Record<string, TerminalViewState>>) => void
  readonly subscribe: (terminalId: string, listener: () => void) => () => void
}

export interface TerminalBlockMetadataInput {
  readonly name: string
  readonly description: string
  readonly launchCommand: string
}

export interface TerminalDefinitionInput extends TerminalBlockMetadataInput {
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

export interface TerminalGroupMetadataInput {
  readonly name: string
}

export interface WorkbenchNodeLayoutInput {
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
}
export type TerminalGroupDropFeedback = 'join' | 'leave' | 'dissolve'

export type WorkbenchObjectMotionKind =
  | 'canvas-arrange'
  | 'create'
  | 'delete'
  | 'group-collapse'
  | 'group-expand'
  | 'group-join'
  | 'group-leave'
  | 'group-reflow'
  | 'move'

interface WorkbenchObjectMotionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface WorkbenchObjectMotion {
  readonly id: string
  readonly kind: WorkbenchObjectMotionKind
  readonly offset: { readonly x: number; readonly y: number }
  readonly positionDynamics?: 'drop' | 'grid'
  readonly contentDelayMs?: number
  readonly delayMs?: number
  readonly opacityDelayMs?: number
  readonly scale?: { readonly from: number; readonly to: number }
  readonly opacity?: { readonly from: number; readonly to: number }
  readonly contentOpacity?: { readonly from: number; readonly to: number }
  readonly shellRect?: {
    readonly from: WorkbenchObjectMotionRect
    readonly to: WorkbenchObjectMotionRect
  }
}

interface WorkbenchObjectPresence {
  readonly id: string
  readonly phase: 'pending' | 'entering'
}

interface WorkbenchObjectMotionNodeData {
  readonly isObjectLayoutChoreographed?: boolean
  readonly objectMotion?: WorkbenchObjectMotion
  readonly objectPresence?: WorkbenchObjectPresence
  readonly onObjectMotionComplete?: (motionId: string) => void
}

interface TerminalNodeData extends Record<string, unknown>, WorkbenchObjectMotionNodeData {
  readonly identity: CanvasObjectIdentity
  readonly approvalIntent?: AgentApprovalNodeIntent
  readonly block: TerminalBlockSnapshot
  readonly session: TerminalViewState
  readonly terminalStateStore?: TerminalStateStore
  readonly isContextSelected?: boolean
  readonly isSelected: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly canSelectForTerminalGroup: boolean
  readonly isNavigationHighlighted: boolean
  readonly isParkedInCollapsedGroup?: boolean
  readonly launchCommandEditRequestId?: number
  readonly isActiveWorkflowRoot?: boolean
  readonly isStoppingWorkflow?: boolean
  readonly workflowStatus?: WorkflowRunNodeStatus
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
  readonly onCopyServiceEndpoint?: (endpoint: TerminalServiceEndpoint) => Promise<void> | void
  readonly onOpenServiceEndpoint?: (identity: TerminalRunIdentity) => Promise<void> | void
  readonly onLocateManagedServiceOwner?: (
    owner: ManagedTerminalServiceOwner
  ) => Promise<void> | void
  readonly onDismissPortConflict?: (identity: TerminalRunIdentity) => void
  readonly onRunFromHere?: (block: TerminalBlockSnapshot) => void
  readonly onStopWorkflow?: () => void
  readonly onViewIdentityStale?: (identity: TerminalRunIdentity) => void
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

export type TerminalFlowNode = Node<TerminalNodeData, 'terminal'>

interface TerminalGroupNodeData extends Record<string, unknown>, WorkbenchObjectMotionNodeData {
  readonly identity: CanvasObjectIdentity
  readonly approvalIntent?: AgentApprovalNodeIntent
  readonly group: TerminalGroupSnapshot
  readonly isContextSelected?: boolean
  readonly memberBlocks: readonly TerminalBlockSnapshot[]
  readonly memberStates: Record<string, TerminalViewState>
  readonly terminalStateStore?: TerminalStateStore
  readonly isEditing?: boolean
  readonly isSelected: boolean
  readonly dropFeedback: TerminalGroupDropFeedback | null
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
  readonly onEditGroup?: (group: TerminalGroupSnapshot) => void
  readonly onRemoveTerminalFromGroup: (
    group: TerminalGroupSnapshot,
    block: TerminalBlockSnapshot
  ) => Promise<void>
  readonly onDissolveGroup: (group: TerminalGroupSnapshot) => Promise<void>
}

export type TerminalGroupFlowNode = Node<TerminalGroupNodeData, 'terminalGroup'>
interface AgentConsoleNodeData extends Record<string, unknown>, WorkbenchObjectMotionNodeData {
  readonly identity: CanvasObjectIdentity
  readonly agent: WorkspaceAgentSnapshot
  readonly isContextSelected?: boolean
  readonly approvalController?: AgentToolApprovalController
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly onGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly onMcpCapabilityChange: (
    agent: WorkspaceAgentSnapshot,
    enabled: boolean
  ) => Promise<UpdateWorkspaceAgentMcpCapabilityResult | undefined>
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onResize: (
    agent: WorkspaceAgentSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelect?: (agentId: string) => void
}

export type AgentConsoleFlowNode = Node<AgentConsoleNodeData, 'agentConsole'>
export type WorkbenchFlowNode = AgentConsoleFlowNode | TerminalFlowNode | TerminalGroupFlowNode
export type MinimapFlowNode = WorkbenchFlowNode

export const defaultTerminalDimensions: TerminalDimensions = {
  columns: 80,
  rows: 24
}

export const terminalNodeMinimumSize = minimumTerminalBlockSize

export function createIdleTerminalState(): TerminalViewState {
  return {
    sessionId: null,
    status: 'idle',
    output: '',
    autoStartStatus: 'idle',
    sessionKind: null,
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    runIdentity: null,
    actualEndpoint: null,
    portConflict: null,
    servicePortState: null
  }
}
