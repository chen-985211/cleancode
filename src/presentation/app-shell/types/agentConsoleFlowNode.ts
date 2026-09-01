import type { Node } from '@xyflow/react'

import type { AgentGraphUpdatedEvent } from '../../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { CanvasObjectIdentity } from '../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'
import type { AgentToolApprovalController } from '../workbench/nodes/agent/agentToolApprovalTypes'
import type { WorkbenchNodeLayoutInput } from './workbenchNodeLayout'
import type { WorkbenchObjectMotionNodeData } from './workbenchObjectMotion'
import type { WorkbenchSnapshot } from './workbenchSnapshot'

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
