import type { Node } from '@xyflow/react'

import {
  minimumTerminalBlockSize,
  type TerminalBlockSnapshot
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalDefinitionInput } from '../../../contexts/block-graph/presentation/view-models/TerminalDefinitionPresentationTypes'
import type {
  ManagedTerminalServiceOwner,
  TerminalRunIdentity,
  TerminalServiceEndpoint
} from '../../../contexts/run/application/dto/TerminalRunEvent'
import type { WorkflowRunNodeStatus } from '../../../contexts/run/application/dto/WorkflowRunSnapshot'
import type {
  TerminalDimensions,
  TerminalStateStore,
  TerminalViewState
} from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { CanvasObjectIdentity } from '../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AgentApprovalNodeIntent } from '../workbench/nodes/agent/agentToolApprovalTypes'
import type { WorkbenchNodeLayoutInput } from './workbenchNodeLayout'
import type { WorkbenchObjectMotionNodeData } from './workbenchObjectMotion'

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

export const defaultTerminalDimensions: TerminalDimensions = {
  columns: 80,
  rows: 24
}

export const terminalNodeMinimumSize = minimumTerminalBlockSize
