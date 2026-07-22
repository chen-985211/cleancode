import { useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

import { createAgentConsoleFlowNode } from './agentConsoleFlowNode'
import { createLegacyAgentSnapshot } from './agentConsoleModel'
import { createAgentApprovalNodeIntents } from './agentApprovalPresentation'
import { preserveWorkbenchNodeTransientLayout } from './preserveWorkbenchNodeTransientLayout'
import { createTerminalFlowNodes } from './terminalFlowNodes'
import type {
  TerminalViewState,
  WorkbenchFlowNode,
  WorkbenchNodeLayoutInput,
  WorkbenchSnapshot
} from './types'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'

type TerminalFlowNodeHandlers = Parameters<typeof createTerminalFlowNodes>[0]['handlers']

interface UseWorkbenchFlowNodesInput {
  readonly agentToolApprovals: AgentToolApprovalController
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
  readonly protectedLayoutNodeIds: ReadonlySet<string>
  readonly onAgentGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly terminalStates: Record<string, TerminalViewState>
  readonly activeWorkflowRootBlockIds?: readonly string[]
  readonly isStoppingWorkflow?: boolean
  readonly workflowNodeStatuses?: Readonly<Record<string, WorkflowRunNodeStatus>>
  readonly onRemoveAgent: (agent: WorkspaceAgentSnapshot) => Promise<void>
  readonly onMcpCapabilityChange: (
    agent: WorkspaceAgentSnapshot,
    enabled: boolean
  ) => Promise<UpdateWorkspaceAgentMcpCapabilityResult | undefined>
  readonly onRenameAgent: (agent: WorkspaceAgentSnapshot, name: string) => Promise<void>
  readonly onResizeAgent: (
    agent: WorkspaceAgentSnapshot,
    layout: WorkbenchNodeLayoutInput
  ) => Promise<void>
  readonly onSelectAgent: (agentId: string) => void
}

export function useWorkbenchFlowNodes({
  agentToolApprovals,
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
  protectedLayoutNodeIds,
  onAgentGraphUpdated,
  setNodes,
  terminalStates,
  activeWorkflowRootBlockIds,
  isStoppingWorkflow,
  workflowNodeStatuses,
  onRemoveAgent,
  onMcpCapabilityChange,
  onRenameAgent,
  onResizeAgent,
  onSelectAgent
}: UseWorkbenchFlowNodesInput): void {
  const graphIdUsedForNodesRef = useRef<string | null>(null)
  const agentToolApprovalsRef = useRef(agentToolApprovals)

  useLayoutEffect(() => {
    agentToolApprovalsRef.current = agentToolApprovals
    setNodes((currentNodes) =>
      projectAgentApprovalsOntoNodes(currentNodes, agentToolApprovals, graph)
    )
  }, [agentToolApprovals, graph, setNodes])

  useEffect(() => {
    const currentAgentToolApprovals = agentToolApprovalsRef.current

    setNodes((currentNodes) => {
      const terminalNodes = createTerminalFlowNodes({
        approvalNodeIntents: createAgentApprovalNodeIntents(
          currentAgentToolApprovals.approvals,
          graph
        ),
        graph,
        handlers,
        hoveredTerminalBlockId,
        activeWorkflowRootBlockIds,
        isStoppingWorkflow,
        isTerminalGroupSelectionMode,
        selectedTerminalBlockIds,
        selectedTerminalGroupId,
        selectedUngroupedTerminalBlockIds,
        terminalStates,
        workflowNodeStatuses
      })
      const agents = resolveWorkspaceAgents(currentWorkbench, currentWorkspace ?? null)
      const nextNodes = [
        ...agents.map((agent) =>
          createAgentConsoleFlowNode({
            agent,
            approvalController: currentAgentToolApprovals,
            currentWorkbench,
            currentWorkspace: currentWorkspace ?? null,
            isSelected: selectedAgentId === agent.agentId,
            onGraphUpdated: onAgentGraphUpdated,
            onMcpCapabilityChange,
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
        ? preserveWorkbenchNodeTransientLayout(nextNodes, currentNodes, protectedLayoutNodeIds)
        : nextNodes
    })
  }, [
    currentWorkbench,
    currentWorkspace,
    graph,
    handlers,
    hoveredTerminalBlockId,
    activeWorkflowRootBlockIds,
    isStoppingWorkflow,
    selectedAgentId,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    selectedUngroupedTerminalBlockIds,
    protectedLayoutNodeIds,
    onAgentGraphUpdated,
    setNodes,
    terminalStates,
    workflowNodeStatuses,
    onRemoveAgent,
    onMcpCapabilityChange,
    onRenameAgent,
    onResizeAgent,
    onSelectAgent
  ])
}

function projectAgentApprovalsOntoNodes(
  nodes: WorkbenchFlowNode[],
  approvalController: AgentToolApprovalController,
  graph: WorkbenchSnapshot['graph'] | null
): WorkbenchFlowNode[] {
  const approvalNodeIntents = createAgentApprovalNodeIntents(approvalController.approvals, graph)
  let didChange = false
  const nextNodes = nodes.map((node): WorkbenchFlowNode => {
    if (node.type === 'agentConsole') {
      if (node.data.approvalController === approvalController) return node
      didChange = true
      return { ...node, data: { ...node.data, approvalController } }
    }

    const approvalIntent = approvalNodeIntents.get(node.id)

    if (node.data.approvalIntent === approvalIntent) return node
    didChange = true
    return { ...node, data: { ...node.data, approvalIntent } } as WorkbenchFlowNode
  })

  return didChange ? nextNodes : nodes
}

function resolveWorkspaceAgents(
  workbench: WorkbenchSnapshot | null,
  workspace: WorkbenchSnapshot['project']['workspaces'][number] | null
): readonly WorkspaceAgentSnapshot[] {
  if (workbench?.agents) return workbench.agents
  const legacyAgent = createLegacyAgentSnapshot(workbench, workspace)
  return legacyAgent ? [legacyAgent] : []
}
