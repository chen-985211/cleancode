import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction
} from 'react'
import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { UpdateWorkspaceAgentMcpCapabilityResult } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { WorkflowRunNodeStatus } from '../../contexts/run/application/dto/WorkflowRunSnapshot'

import { createAgentConsoleFlowNode } from './agentConsoleFlowNode'
import { createAgentApprovalNodeIntents } from './agentApprovalPresentation'
import { preserveWorkbenchNodeTransientLayout } from './preserveWorkbenchNodeTransientLayout'
import { createTerminalFlowNodes } from './terminalFlowNodes'
import type {
  WorkbenchFlowNode,
  WorkbenchNodeLayoutInput,
  WorkbenchObjectMotion,
  WorkbenchSnapshot
} from './types'
import type { TerminalViewState } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'
import { projectWorkbenchObjectMotion } from './workbenchObjectMotion'
import { prefersReducedMotion } from './workbenchViewportMotion'
import { projectCanvasArrangementStackingOntoNodes } from './workbenchCanvasArrangementStackingProjection'
import type { CanvasArrangementMotionChoreography } from '../../contexts/canvas-arrangement/presentation/motion/canvasArrangementMotion'
import {
  createTerminalStateStore,
  type TerminalStateStore
} from '../../contexts/run/presentation/view-models/terminalStateStore'
import { reconcileWorkbenchNodeProjection } from './workbenchNodeProjectionReconciler'

type TerminalFlowNodeHandlers = Parameters<typeof createTerminalFlowNodes>[0]['handlers']

interface UseWorkbenchFlowNodesInput {
  readonly canvasArrangementMotion?: CanvasArrangementMotionChoreography | null
  readonly agentToolApprovals: AgentToolApprovalController
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly handlers: TerminalFlowNodeHandlers
  readonly hoveredTerminalBlockId: string | null
  readonly selectedAgentId: string | null
  readonly editingTerminalGroupId: string | null
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedTerminalGroupId: string | null
  readonly selectedUngroupedTerminalBlockIds?: readonly string[]
  readonly protectedLayoutNodeIds: ReadonlySet<string>
  readonly onAgentGraphUpdated: (event: AgentGraphUpdatedEvent) => void
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly terminalStates?: Record<string, TerminalViewState>
  readonly terminalStateStore?: TerminalStateStore
  readonly activeWorkflowRunIdByRootBlockId?: Readonly<Record<string, string>>
  readonly stoppingWorkflowRunIds?: readonly string[]
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
  canvasArrangementMotion = null,
  agentToolApprovals,
  currentWorkbench,
  currentWorkspace,
  graph,
  handlers,
  hoveredTerminalBlockId,
  selectedAgentId,
  editingTerminalGroupId,
  isTerminalGroupSelectionMode,
  selectedTerminalBlockIds,
  selectedTerminalGroupId,
  protectedLayoutNodeIds,
  onAgentGraphUpdated,
  setNodes,
  terminalStates = {},
  terminalStateStore: providedTerminalStateStore,
  activeWorkflowRunIdByRootBlockId,
  stoppingWorkflowRunIds,
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
  const activeObjectEntrancesRef = useRef(new Map<string, WorkbenchObjectMotion>())
  const exitingObjectNodesRef = useRef(new Map<string, WorkbenchFlowNode>())
  const parkedCollapsedMemberNodesRef = useRef(new Map<string, WorkbenchFlowNode>())
  const nextObjectMotionIdRef = useRef(1)
  const fallbackTerminalStateStoreRef = useRef<TerminalStateStore | null>(null)
  fallbackTerminalStateStoreRef.current ??= createTerminalStateStore(terminalStates)
  const terminalStateStore = providedTerminalStateStore ?? fallbackTerminalStateStoreRef.current
  const fallbackTerminalStates = providedTerminalStateStore ? null : terminalStates

  useLayoutEffect(() => {
    if (fallbackTerminalStates) terminalStateStore.replaceStates(fallbackTerminalStates)
  }, [fallbackTerminalStates, terminalStateStore])

  const completeObjectMotion = useCallback(
    (nodeId: string, motionId: string): void => {
      const activeEntrance = activeObjectEntrancesRef.current.get(nodeId)
      if (activeEntrance?.id === motionId) {
        activeObjectEntrancesRef.current.delete(nodeId)
        setNodes((nodes) =>
          nodes.map((node): WorkbenchFlowNode => {
            if (node.id !== nodeId || node.data.objectMotion?.id !== motionId) return node
            return {
              ...node,
              data: {
                ...node.data,
                objectMotion: undefined,
                onObjectMotionComplete: undefined
              }
            } as WorkbenchFlowNode
          })
        )
        return
      }

      const exitingNode = exitingObjectNodesRef.current.get(nodeId)
      if (exitingNode?.data.objectMotion?.id !== motionId) return

      exitingObjectNodesRef.current.delete(nodeId)
      if (
        exitingNode.data.objectMotion.kind === 'group-collapse' &&
        exitingNode.type === 'terminal'
      ) {
        const parkedNode = parkCollapsedTerminalNode(exitingNode)
        parkedCollapsedMemberNodesRef.current.set(nodeId, parkedNode)
        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === nodeId && node.data.objectMotion?.id === motionId ? parkedNode : node
          )
        )
        return
      }

      setNodes((nodes) =>
        nodes.filter((node) => node.id !== nodeId || node.data.objectMotion?.id !== motionId)
      )
    },
    [setNodes]
  )

  useLayoutEffect(() => {
    agentToolApprovalsRef.current = agentToolApprovals
    setNodes((currentNodes) =>
      projectAgentApprovalsOntoNodes(currentNodes, agentToolApprovals, graph)
    )
  }, [agentToolApprovals, graph, setNodes])

  useEffect(() => {
    const currentAgentToolApprovals = agentToolApprovalsRef.current

    setNodes((currentNodes) => {
      const terminalNodeTemplates = createTerminalFlowNodes({
        approvalNodeIntents: createAgentApprovalNodeIntents(
          currentAgentToolApprovals.approvals,
          graph
        ),
        graph,
        handlers,
        hoveredTerminalBlockId,
        activeWorkflowRunIdByRootBlockId,
        stoppingWorkflowRunIds,
        launchCommandEditRequest,
        editingTerminalGroupId,
        selectedTerminalBlockIds,
        selectedTerminalGroupId,
        terminalStateStore,
        includeCollapsedMembers: true,
        workflowBuildPresentation: terminalWorkflowBuildPresentation,
        workflowNodeStatuses
      })
      const collapsedGraphMemberIds = new Set(
        (graph?.terminalGroups ?? [])
          .filter((group) => group.isCollapsed)
          .flatMap((group) => group.memberBlockIds)
      )
      const terminalNodes = terminalNodeTemplates.filter(
        (node) => node.type !== 'terminal' || !collapsedGraphMemberIds.has(node.id)
      )
      const agents = resolveWorkspaceAgents(currentWorkbench)
      const nextNodes = projectCanvasArrangementStackingOntoNodes(
        currentWorkbench?.canvasArrangement,
        [
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
              onSelect: onSelectAgent
            })
          ),
          ...terminalNodes
        ]
      )
      const graphId = graph?.id ?? null
      const shouldPreserveTransientLayout = graphIdUsedForNodesRef.current === graphId
      graphIdUsedForNodesRef.current = graphId

      if (!shouldPreserveTransientLayout) {
        activeObjectEntrancesRef.current.clear()
        exitingObjectNodesRef.current.clear()
        parkedCollapsedMemberNodesRef.current.clear()
      } else {
        const terminalTemplatesById = new Map(
          terminalNodeTemplates
            .filter((node) => node.type === 'terminal')
            .map((node) => [node.id, node])
        )
        parkedCollapsedMemberNodesRef.current.forEach((_parkedNode, nodeId) => {
          const template = terminalTemplatesById.get(nodeId)
          if (template) {
            parkedCollapsedMemberNodesRef.current.set(nodeId, parkCollapsedTerminalNode(template))
          }
        })
      }

      const motionProjection = projectWorkbenchObjectMotion({
        canvasArrangementMotion,
        createMotionId: (kind, nodeId) => {
          const motionId = `workbench-object-motion-${nextObjectMotionIdRef.current}-${kind}-${nodeId}`
          nextObjectMotionIdRef.current += 1
          return motionId
        },
        currentNodes,
        isCanvasArrangementPending: canvasArrangementMotion !== null,
        isContinuingGraph: shouldPreserveTransientLayout,
        nextNodes,
        reducedMotion: prefersReducedMotion()
      })
      motionProjection.nodes.forEach((node) => {
        if (node.data.objectMotion) {
          activeObjectEntrancesRef.current.set(node.id, node.data.objectMotion)
        }
      })
      const projectedNodeIds = new Set(motionProjection.nodes.map((node) => node.id))
      activeObjectEntrancesRef.current.forEach((_motion, nodeId) => {
        if (!projectedNodeIds.has(nodeId)) activeObjectEntrancesRef.current.delete(nodeId)
      })
      projectedNodeIds.forEach((nodeId) => exitingObjectNodesRef.current.delete(nodeId))
      projectedNodeIds.forEach((nodeId) => parkedCollapsedMemberNodesRef.current.delete(nodeId))
      const collapsedMemberIds = new Set(
        motionProjection.nodes
          .filter((node) => node.type === 'terminalGroup' && node.data.group.isCollapsed)
          .flatMap((node) => (node.type === 'terminalGroup' ? node.data.group.memberBlockIds : []))
      )
      parkedCollapsedMemberNodesRef.current.forEach((_node, nodeId) => {
        if (!collapsedMemberIds.has(nodeId)) parkedCollapsedMemberNodesRef.current.delete(nodeId)
      })
      motionProjection.exitingNodes.forEach((node) => {
        exitingObjectNodesRef.current.set(node.id, {
          ...node,
          data: {
            ...node.data,
            onObjectMotionComplete: (motionId) => completeObjectMotion(node.id, motionId)
          }
        } as WorkbenchFlowNode)
      })
      const nodesWithEntrances = motionProjection.nodes.map((node): WorkbenchFlowNode => {
        const objectMotion = activeObjectEntrancesRef.current.get(node.id)
        if (!objectMotion) return node

        return {
          ...node,
          data: {
            ...node.data,
            objectMotion,
            onObjectMotionComplete: (motionId) => completeObjectMotion(node.id, motionId)
          }
        } as WorkbenchFlowNode
      })
      const nodesWithExits = [
        ...nodesWithEntrances,
        ...exitingObjectNodesRef.current.values(),
        ...parkedCollapsedMemberNodesRef.current.values()
      ]

      const projectedNodes = shouldPreserveTransientLayout
        ? preserveWorkbenchNodeTransientLayout(nodesWithExits, currentNodes, protectedLayoutNodeIds)
        : nodesWithExits
      return reconcileWorkbenchNodeProjection(projectedNodes, currentNodes)
    })
  }, [
    canvasArrangementMotion,
    currentWorkbench,
    currentWorkspace,
    completeObjectMotion,
    graph,
    handlers,
    hoveredTerminalBlockId,
    activeWorkflowRunIdByRootBlockId,
    stoppingWorkflowRunIds,
    launchCommandEditRequest,
    selectedAgentId,
    editingTerminalGroupId,
    isTerminalGroupSelectionMode,
    selectedTerminalBlockIds,
    selectedTerminalGroupId,
    protectedLayoutNodeIds,
    onAgentGraphUpdated,
    setNodes,
    terminalStateStore,
    workflowNodeStatuses,
    terminalWorkflowBuildPresentation,
    onRemoveAgent,
    onMcpCapabilityChange,
    onRenameAgent,
    onResizeAgent,
    onSelectAgent
  ])
}

function parkCollapsedTerminalNode(node: WorkbenchFlowNode): WorkbenchFlowNode {
  if (node.type !== 'terminal') return node

  return {
    ...node,
    draggable: false,
    selected: false,
    data: {
      ...node.data,
      isParkedInCollapsedGroup: true,
      isSelected: false,
      objectMotion: undefined,
      onObjectMotionComplete: undefined
    }
  }
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
