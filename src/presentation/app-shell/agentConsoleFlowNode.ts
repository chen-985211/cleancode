import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
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
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | null
  readonly isSelected: boolean
  readonly onGraphUpdated: (graph: BlockGraphSnapshot) => void
}

export function createAgentConsoleFlowNode({
  currentWorkbench,
  currentWorkspace,
  isSelected,
  onGraphUpdated
}: CreateAgentConsoleFlowNodeInput): AgentConsoleFlowNode {
  return {
    id: 'agent-console',
    type: 'agentConsole',
    dragHandle: '.agent-console__header',
    position: { x: resolveDefaultAgentConsoleX(), y: 120 },
    selected: isSelected,
    zIndex: 4,
    style: defaultAgentConsoleSize,
    data: {
      currentWorkbench,
      currentWorkspace,
      onGraphUpdated
    }
  }
}

function resolveDefaultAgentConsoleX(): number {
  return globalThis.innerWidth <= 1080 ? 300 : 540
}
