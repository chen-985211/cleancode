import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps
} from '@xyflow/react'
import { memo } from 'react'

import type { AgentApprovalIntentEdgeData } from './agentApprovalPresentation'

type ApprovalIntentEdge = Edge<AgentApprovalIntentEdgeData, 'approvalIntent'>

export const AgentApprovalIntentEdge = memo(function AgentApprovalIntentEdge({
  data,
  markerEnd,
  sourcePosition,
  sourceX,
  sourceY,
  targetPosition,
  targetX,
  targetY
}: EdgeProps<ApprovalIntentEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY
  })

  return (
    <>
      <BaseEdge className="agent-approval-intent-edge__path" path={path} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <span
          className="agent-approval-intent-edge__label nodrag nopan"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {data?.label ?? 'AI 操作目标'}
        </span>
      </EdgeLabelRenderer>
    </>
  )
})
