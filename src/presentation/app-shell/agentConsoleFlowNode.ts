import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentConsoleFlowNode, WorkbenchSnapshot } from './types'

const defaultAgentConsoleSize = {
  width: 440,
  height: 520
}

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
  readonly onRemove: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRename: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onResize: (agent: WorkspaceAgentSnapshot, width: number, height: number) => Promise<void>
}

export function createAgentConsoleFlowNode({
  agent,
  currentWorkbench,
  currentWorkspace,
  isSelected,
  onGraphUpdated,
  onRemove,
  onRename,
  onResize
}: CreateAgentConsoleFlowNodeInput): AgentConsoleFlowNode {
  return {
    id: toAgentFlowNodeId(agent.agentId),
    type: 'agentConsole',
    dragHandle: '.agent-console__header',
    position: agent.layout.position,
    selected: isSelected,
    zIndex: 4,
    style: agent.layout.size,
    data: {
      agent,
      currentWorkbench,
      currentWorkspace,
      onGraphUpdated,
      onRemove,
      onRename,
      onResize
    }
  }
}

function toAgentFlowNodeId(agentId: string): string {
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
    layout: {
      position: { x: resolveDefaultAgentConsoleX(), y: 120 },
      size: defaultAgentConsoleSize
    },
    name: 'Agent 1',
    projectId: currentWorkbench?.project.id ?? 'unselected-project',
    workspaceName: currentWorkspace?.name ?? 'unselected-workspace'
  }
}
