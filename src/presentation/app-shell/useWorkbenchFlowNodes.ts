import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

import { createAgentConsoleFlowNode, createLegacyAgentSnapshot } from './agentConsoleFlowNode'
import { preserveWorkbenchNodeTransientLayout } from './preserveWorkbenchNodeTransientLayout'
import { createTerminalFlowNodes } from './terminalFlowNodes'
import type { TerminalGroupDropAction } from './terminalGroupDropTarget'
import type {
  TerminalViewState,
  WorkbenchFlowNode,
  WorkbenchNodeLayoutInput,
  WorkbenchSnapshot
} from './types'

type TerminalFlowNodeHandlers = Parameters<typeof createTerminalFlowNodes>[0]['handlers']

interface UseWorkbenchFlowNodesInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly handlers: TerminalFlowNodeHandlers
  readonly hoveredTerminalBlockId: string | null
  readonly selectedAgentId: string | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedTerminalGroupId: string | null
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly terminalGroupDropAction: TerminalGroupDropAction
  readonly terminalStates: Record<string, TerminalViewState>
  readonly workflowNodeStatuses?: Readonly<Record<string, WorkflowRunNodeStatus>>
  readonly onRemoveAgent: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onRenameAgent: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onResizeAgent: (
    agent: WorkspaceAgentSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelectAgent: (agentId: string) => void
}

export function useWorkbenchFlowNodes({
  currentWorkbench,
  currentWorkspace,
  graph,
  handlers,
  hoveredTerminalBlockId,
  selectedAgentId,
  isTerminalGroupSelectionMode,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  selectedUngroupedTerminalBlockIds,
  setCurrentGraph,
  setNodes,
  terminalGroupDropAction,
  terminalStates,
  workflowNodeStatuses,
  onRemoveAgent,
  onRenameAgent,
  onResizeAgent,
  onSelectAgent
}: UseWorkbenchFlowNodesInput): void {
  const graphIdUsedForNodesRef = useRef<string | null>(null)

  useEffect(() => {
    setNodes((currentNodes) => {
      const terminalNodes = createTerminalFlowNodes({
        graph,
        handlers,
        hoveredTerminalBlockId,
        isTerminalGroupSelectionMode,
        selectedTerminalBlockIds,
        selectedTerminalGroupId,
        selectedUngroupedTerminalBlockIds,
        terminalGroupDropAction,
        terminalStates,
        workflowNodeStatuses
      })
      const agents = resolveWorkspaceAgents(currentWorkbench, currentWorkspace ?? null)
      const nextNodes = [
        ...agents.map((agent) =>
          createAgentConsoleFlowNode({
            agent,
            currentWorkbench,
            currentWorkspace: currentWorkspace ?? null,
            isSelected: selectedAgentId === agent.agentId,
            onGraphUpdated: setCurrentGraph,
            onRemove: onRemoveAgent,
            onRename: onRenameAgent,
            onResize: onResizeAgent,
            onSelect: () => onSelectAgent(agent.agentId)
          })
        ),
        ...terminalNodes
      ]
      const graphId = graph?.id ?? null
      const shouldPreserveTransientLayout = graphIdUsedForNodesRef.current === graphId
      graphIdUsedForNodesRef.current = graphId

      return shouldPreserveTransientLayout
        ? preserveWorkbenchNodeTransientLayout(nextNodes, currentNodes)
        : nextNodes
    })
  }, [
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers,
    hoveredTerminalBlockId,
    selectedAgentId,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    selectedUngroupedTerminalBlockIds,
    setCurrentGraph,
    setNodes,
    terminalGroupDropAction,
    terminalStates,
    workflowNodeStatuses,
    onRemoveAgent,
    onRenameAgent,
    onResizeAgent,
    onSelectAgent
  ])
}

function resolveWorkspaceAgents(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): readonly WorkspaceAgentSnapshot[] {
  if (workbench?.agents) return workbench.agents
  const legacyAgent = createLegacyAgentSnapshot(workbench, workspace)
  return legacyAgent ? [legacyAgent] : []
}
