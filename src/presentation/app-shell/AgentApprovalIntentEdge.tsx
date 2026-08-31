import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps
} from '@xyflow/react'
import { memo } from 'react'

import type { AgentApprovalIntentEdgeData } from './agentApprovalPresentation'
import { useI18n } from '../i18n/useI18n'

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
  const { t } = useI18n()
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
          {data?.label ?? t('agentApproval.intentTarget')}
        </span>
      </EdgeLabelRenderer>
    </>
  )
})
