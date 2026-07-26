import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { AgentConsoleFlowNode, WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import { createCanvasObjectIdentity } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export const minimumAgentConsoleSize = {
  width: 420,
  height: 360
}

interface CreateAgentConsoleFlowNodeInput {
  readonly agent: WorkspaceAgentSnapshot
  readonly approvalController?: AgentToolApprovalController
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly isSelected: boolean
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
  readonly onSelect?: () => void
}

export function createAgentConsoleFlowNode({
  agent,
  approvalController,
  currentWorkbench,
  currentWorkspace,
  isSelected,
  onGraphUpdated,
  onMcpCapabilityChange,
  onRemove,
  onRename,
  onResize,
  onSelect
}: CreateAgentConsoleFlowNodeInput): AgentConsoleFlowNode {
  return {
    id: toAgentFlowNodeId(agent.agentId),
    type: 'agentConsole',
    dragHandle: '.agent-console__header',
    position: agent.layout.position,
    selectable: false,
    selected: isSelected,
    zIndex: 4,
    style: agent.layout.size,
    data: {
      identity: createCanvasObjectIdentity({
        projectId: agent.projectId,
        workspaceId: agent.workspaceId,
        objectKind: 'agent',
        objectId: agent.agentId
      }),
      agent,
      approvalController,
      currentWorkbench,
      currentWorkspace,
      onGraphUpdated,
      onMcpCapabilityChange,
      onRemove,
      onRename,
      onResize,
      onSelect
    }
  }
}

export function toAgentFlowNodeId(agentId: string): string {
  return `agent:${agentId}`
}

export function readAgentIdFromFlowNodeId(nodeId: string): string | null {
  return nodeId.startsWith('agent:') ? nodeId.slice('agent:'.length) || null : null
}
