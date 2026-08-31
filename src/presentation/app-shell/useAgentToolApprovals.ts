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

import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveAgentApprovalPresentation } from './agentApprovalPresentation'
import type {
  AgentToolApprovalController,
  AgentToolApprovalPresentationRequest,
  AgentToolApprovalViewState
} from './agentToolApprovalTypes'
import type { WorkbenchFlowNode } from './types'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'
import { useI18n } from '../i18n/useI18n'
import type { Translate } from '../i18n/messages'

interface UseAgentToolApprovalsInput {
  readonly graph: BlockGraphSnapshot | null
  readonly projectDirectory: string | null
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly setCurrentGraph: (graph: BlockGraphSnapshot) => void
  readonly workspaceId: string | null
}

export function useAgentToolApprovals({
  graph,
  projectDirectory,
  reactFlowInstanceRef,
  setCurrentGraph,
  workspaceId
}: UseAgentToolApprovalsInput): AgentToolApprovalController {
  const { t } = useI18n()
  const [approvals, setApprovals] = useState<AgentToolApprovalViewState[]>([])
  const scopeRef = useRef({ projectDirectory, workspaceId })
  const graphRef = useRef(graph)

  useLayoutEffect(() => {
    graphRef.current = graph
  }, [graph])

  useLayoutEffect(() => {
    scopeRef.current = { projectDirectory, workspaceId }
    setApprovals((current) => (current.length === 0 ? current : []))
  }, [projectDirectory, workspaceId])

  useLayoutEffect(() => {
    const api = window.cleancode

    if (!api?.onAgentToolApprovalRequested) return undefined

    return api.onAgentToolApprovalRequested((request) => {
      const scope = scopeRef.current

      if (
        request.projectDirectory !== scope.projectDirectory ||
        request.workspaceId !== scope.workspaceId
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
    async (request: AgentToolApprovalPresentationRequest) => {
      setApprovalPhase(setApprovals, request.approvalId, 'approving')

      try {
        const result = await window.cleancode?.approveAgentTool({
          approvalId: request.approvalId
        })

        if (result?.status === 'failed') {
          setApprovalFailure(
            setApprovals,
            request.approvalId,
            t('approval.failedWithMessage', { message: result.error.message })
          )
          return
        }
        if (result?.status === 'completed') setCurrentGraph(result.graph)
        removeApproval(request.approvalId)
      } catch (error) {
        setApprovalFailure(setApprovals, request.approvalId, readApprovalError(error, t))
      }
    },
    [removeApproval, setCurrentGraph, t]
  )

  const reject = useCallback(
    async (request: AgentToolApprovalPresentationRequest) => {
      try {
        await window.cleancode?.rejectAgentTool({ approvalId: request.approvalId })
        removeApproval(request.approvalId)
      } catch (error) {
        setApprovalFailure(setApprovals, request.approvalId, readApprovalError(error, t))
      }
    },
    [removeApproval, t]
  )

  const dismiss = useCallback(
    (request: AgentToolApprovalPresentationRequest) => removeApproval(request.approvalId),
    [removeApproval]
  )

  const clearForAgent = useCallback((agentId: string) => {
    setApprovals((current) => current.filter((approval) => approval.request.agentId !== agentId))
  }, [])

  const locate = useCallback(
    (request: AgentToolApprovalPresentationRequest) => {
      const instance = reactFlowInstanceRef.current
      const presentation = resolveAgentApprovalPresentation(request, graphRef.current)

      if (!instance || presentation.status === 'missing') return

      const visibleTargetNodeIds =
        presentation.targetKind === 'connection'
          ? [presentation.visibleSourceNodeId, presentation.visibleTargetNodeId]
          : [presentation.visibleTargetNodeId]
      const focusNodeIds = [presentation.agentNodeId, ...visibleTargetNodeIds].filter(
        (nodeId, index, nodeIds) => nodeIds.indexOf(nodeId) === index
      )
      const focusNodes = focusNodeIds
        .map((nodeId) => instance.getNode(nodeId))
        .filter((node): node is WorkbenchFlowNode => Boolean(node))

      if (focusNodes.length === 0) return
      void transitionWorkbenchViewport(instance, {
        intent: { type: 'spatial' },
        nodes: focusNodes,
        padding: 0.24,
        type: 'fit-view'
      })
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

function readApprovalError(error: unknown, t: Translate): string {
  return error instanceof Error && error.message
    ? t('approval.failedWithMessage', { message: error.message })
    : t('approval.failedFallback')
}
