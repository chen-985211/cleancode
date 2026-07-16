import type { Edge, ReactFlowInstance } from '@xyflow/react'
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from 'react'

import type { AgentToolApprovalRequest } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import type {
  AgentToolApprovalController,
  AgentToolApprovalViewState
} from './agentToolApprovalTypes'
import type { WorkbenchFlowNode } from './types'

interface UseAgentToolApprovalsInput {
  readonly graph: BlockGraphSnapshot | null
  readonly projectDirectory: string | null
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: BlockGraphSnapshot) => void
  readonly workspaceName: string | null
}

export function useAgentToolApprovals({
  graph,
  projectDirectory,
  reactFlowInstanceRef,
  setCurrentGraph,
  workspaceName
}: UseAgentToolApprovalsInput): AgentToolApprovalController {
  const [approvals, setApprovals] = useState<AgentToolApprovalViewState[]>([])
  const scopeRef = useRef({ projectDirectory, workspaceName })
  const graphRef = useRef(graph)

  useLayoutEffect(() => {
    graphRef.current = graph
  }, [graph])

  useLayoutEffect(() => {
    scopeRef.current = { projectDirectory, workspaceName }
    setApprovals((current) => (current.length === 0 ? current : []))
  }, [projectDirectory, workspaceName])

  useLayoutEffect(() => {
    const api = window.cleancode

    if (!api?.onAgentToolApprovalRequested) return undefined

    return api.onAgentToolApprovalRequested((request) => {
      const scope = scopeRef.current

      if (
        request.projectDirectory !== scope.projectDirectory ||
        request.workspaceName !== scope.workspaceName
      ) {
        return
      }

      setApprovals((current) =>
        current.some((approval) => approval.request.approvalId === request.approvalId)
          ? current
          : [...current, { phase: 'awaiting', request }]
      )
    })
  }, [])

  const removeApproval = useCallback((approvalId: string) => {
    setApprovals((current) =>
      current.filter((approval) => approval.request.approvalId !== approvalId)
    )
  }, [])

  const approve = useCallback(
    async (request: AgentToolApprovalRequest) => {
      setApprovalPhase(setApprovals, request.approvalId, 'approving')

      try {
        const result = await window.cleancode?.approveAgentTool({
          approvalId: request.approvalId
        })

        if (result?.status === 'completed') setCurrentGraph(result.graph)
        removeApproval(request.approvalId)
      } catch (error) {
        setApprovalFailure(setApprovals, request.approvalId, readApprovalError(error))
      }
    },
    [removeApproval, setCurrentGraph]
  )

  const reject = useCallback(
    async (request: AgentToolApprovalRequest) => {
      try {
        await window.cleancode?.rejectAgentTool({ approvalId: request.approvalId })
        removeApproval(request.approvalId)
      } catch (error) {
        setApprovalFailure(setApprovals, request.approvalId, readApprovalError(error))
      }
    },
    [removeApproval]
  )

  const dismiss = useCallback(
    (request: AgentToolApprovalRequest) => removeApproval(request.approvalId),
    [removeApproval]
  )

  const clearForAgent = useCallback((agentId: string) => {
    setApprovals((current) => current.filter((approval) => approval.request.agentId !== agentId))
  }, [])

  const locate = useCallback(
    (request: AgentToolApprovalRequest) => {
      const instance = reactFlowInstanceRef.current
      const presentation = resolveAgentApprovalPresentation(request, graphRef.current)

      if (!instance || presentation.status === 'missing') return

      const focusNodes = [
        instance.getNode(presentation.agentNodeId),
        instance.getNode(presentation.visibleTargetNodeId)
      ].filter((node): node is WorkbenchFlowNode => Boolean(node))

      if (focusNodes.length === 0) return
      void instance.fitView({ duration: 220, nodes: focusNodes, padding: 0.24 })
    },
    [reactFlowInstanceRef]
  )

  return useMemo(
    () => ({ approvals, approve, clearForAgent, dismiss, locate, reject }),
    [approvals, approve, clearForAgent, dismiss, locate, reject]
  )
}

function setApprovalPhase(
  setApprovals: Dispatch<SetStateAction<AgentToolApprovalViewState[]>>,
  approvalId: string,
  phase: AgentToolApprovalViewState['phase']
): void {
  setApprovals((current) =>
    current.map((approval) =>
      approval.request.approvalId === approvalId ? { ...approval, phase } : approval
    )
  )
}

function setApprovalFailure(
  setApprovals: Dispatch<SetStateAction<AgentToolApprovalViewState[]>>,
  approvalId: string,
  errorMessage: string
): void {
  setApprovals((current) =>
    current.map((approval) =>
      approval.request.approvalId === approvalId
        ? { ...approval, errorMessage, phase: 'failed' }
        : approval
    )
  )
}

function readApprovalError(error: unknown): string {
  return error instanceof Error && error.message
    ? `操作未完成：${error.message}`
    : '操作未完成。AI 可重新发起请求。'
}
