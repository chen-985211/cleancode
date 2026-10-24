import { useMemo, useRef } from 'react'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchCanvasProps } from './workbenchCanvasProps'
import { createAgentApprovalIntentEdges } from '../projections/agentApprovalPresentation'
import { projectAgentConnectionApprovalsOntoWorkflowEdges } from '../projections/agentApprovalConnectionProjection'
import { projectTerminalWorkflowBuildOntoEdges } from '../projections/terminalWorkflowBuildEdgePresentation'
import { createWorkbenchObjectMotionEdgeProjector } from '../projections/workbenchObjectMotion'
import { useI18n } from '../../i18n/useI18n'

export function useWorkbenchCanvasEdges({
  approvalIntents = [],
  currentWorkbench,
  terminalWorkflowBuildPresentation = null,
  workflow,
  nodes
}: Pick<
  WorkbenchCanvasProps,
  'approvalIntents' | 'currentWorkbench' | 'terminalWorkflowBuildPresentation'
> & {
  readonly workflow: NonNullable<WorkbenchCanvasProps['terminalWorkflow']>
  readonly nodes: readonly WorkbenchFlowNode[]
}) {
  const { t } = useI18n()
  const projectorRef = useRef<ReturnType<typeof createWorkbenchObjectMotionEdgeProjector> | null>(
    null
  )
  const projector = (projectorRef.current ??= createWorkbenchObjectMotionEdgeProjector())
  const graph = currentWorkbench?.graph ?? null
  const baseEdges = useMemo(
    () => [
      ...projectAgentConnectionApprovalsOntoWorkflowEdges(
        projectTerminalWorkflowBuildOntoEdges(workflow.edges, terminalWorkflowBuildPresentation),
        approvalIntents,
        graph
      ),
      ...createAgentApprovalIntentEdges(approvalIntents, graph, t)
    ],
    [workflow.edges, terminalWorkflowBuildPresentation, approvalIntents, graph, t]
  )
  return useMemo(() => projector.project(baseEdges, nodes), [baseEdges, nodes, projector])
}
