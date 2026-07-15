import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import { defaultAgentLayoutSize } from '../../contexts/agent/domain/aggregates/AgentSession'
import type { AgentConsoleFlowNode, WorkbenchNodeLayoutInput, WorkbenchSnapshot } from './types'

export const minimumAgentConsoleSize = {
  width: 420,
  height: 360
}

interface CreateAgentConsoleFlowNodeInput {
  readonly agent: WorkspaceAgentSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly isSelected: boolean
  readonly onGraphUpdated: (graph: BlockGraphSnapshot) => void
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
      agent,
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

function resolveDefaultAgentConsoleX(): number {
  return globalThis.innerWidth <= 1080 ? 300 : 540
}

export function createLegacyAgentSnapshot(
  currentWorkbench: WorkbenchSnapshot | null,
  currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): WorkspaceAgentSnapshot | null {
  return {
    agentId: 'default-agent',
    cleancodeMcpEnabled: true,
    layout: {
      position: { x: resolveDefaultAgentConsoleX(), y: 120 },
      size: defaultAgentLayoutSize
    },
    name: 'Agent 1',
    projectId: currentWorkbench?.project.id ?? 'unselected-project',
    workspaceName: currentWorkspace?.name ?? 'unselected-workspace'
  }
}
