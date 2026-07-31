import { useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

import { createAgentConsoleFlowNode } from './agentConsoleFlowNode'
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
import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'

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
  readonly launchCommandEditRequest?: {
    readonly blockId: string
    readonly requestId: number
  } | null
  readonly workflowNodeStatuses?: Readonly<Record<string, WorkflowRunNodeStatus>>
  readonly terminalWorkflowBuildPresentation?: TerminalWorkflowBuildPresentation | null
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
  launchCommandEditRequest,
  workflowNodeStatuses,
  terminalWorkflowBuildPresentation,
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
        launchCommandEditRequest,
        isTerminalGroupSelectionMode,
        selectedTerminalBlockIds,
        selectedTerminalGroupId,
        selectedUngroupedTerminalBlockIds,
        terminalStates,
        workflowBuildPresentation: terminalWorkflowBuildPresentation,
        workflowNodeStatuses
      })
      const agents = resolveWorkspaceAgents(currentWorkbench)
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
    launchCommandEditRequest,
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
    terminalWorkflowBuildPresentation,
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
  workbench: WorkbenchSnapshot | null
): readonly WorkspaceAgentSnapshot[] {
  return workbench?.agents ?? []
}
