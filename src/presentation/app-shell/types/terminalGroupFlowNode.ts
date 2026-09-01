import type { Node } from '@xyflow/react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { UpdateTerminalGroupMetadataInput } from '../../../contexts/block-graph/domain/aggregates/BlockGraphTypes'
import type { TerminalGroupDropFeedback } from '../../../contexts/block-graph/presentation/view-models/TerminalGroupPresentationTypes'
import type {
  TerminalStateStore,
  TerminalViewState
} from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { CanvasObjectIdentity } from '../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AgentApprovalNodeIntent } from '../workbench/nodes/agent/agentToolApprovalTypes'
import type { WorkbenchObjectMotionNodeData } from './workbenchObjectMotion'

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
    metadata: UpdateTerminalGroupMetadataInput
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
