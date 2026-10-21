import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Fragment, memo } from 'react'

import { TerminalGroupCard } from '../../../../../contexts/block-graph/presentation/components/TerminalGroupCard'
import { useI18n } from '../../../../i18n/useI18n'
import {
  agentApprovalConnectionSourceHandleId,
  agentApprovalConnectionTargetHandleId,
  agentApprovalTargetHandleId
} from '../agent/agentApprovalHandles'
import type { TerminalGroupFlowNode } from '../../../types/terminalGroupFlowNode'
import { useWorkbenchObjectMotionPresentation } from '../useWorkbenchObjectMotionPresentation'
import { WorkbenchNodeSelectionVeil } from '../WorkbenchNodeSelectionVeil'

export const TerminalGroupNode = memo(function TerminalGroupNode({
  data
}: NodeProps<TerminalGroupFlowNode>) {
  const { t } = useI18n()
  const objectMotion = useWorkbenchObjectMotionPresentation(
    data.objectMotion,
    data.onObjectMotionComplete,
    data.isObjectMotionFrozen
  )
  const isPending = data.objectPresence?.phase === 'pending'
  const surfaceClassName = [
    objectMotion.className,
    isPending ? 'workbench-object-presence--pending' : '',
    data.approvalIntent ? 'terminal-group-node--approval-target' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <TerminalGroupCard
      data={data}
      isContextSelected={data.isContextSelected}
      isPending={isPending}
      leadingContent={
        <Fragment>
          <Handle
            id="workflow-input"
            className="terminal-node__handle terminal-node__handle--input"
            type="target"
            position={Position.Left}
            isConnectable={false}
          />
          <Handle
            id="workflow-output"
            className="terminal-node__handle terminal-node__handle--output"
            type="source"
            position={Position.Right}
            isConnectable={false}
          />
          <Handle
            id={agentApprovalConnectionSourceHandleId}
            className="agent-approval-intent-handle agent-approval-connection-handle--source"
            type="source"
            position={Position.Right}
            isConnectable={false}
          />
          <Handle
            id={agentApprovalConnectionTargetHandleId}
            className="agent-approval-intent-handle agent-approval-connection-handle--target"
            type="target"
            position={Position.Left}
            isConnectable={false}
          />
          <Handle
            id={agentApprovalTargetHandleId}
            className="agent-approval-intent-handle agent-approval-intent-handle--target"
            type="target"
            position={Position.Left}
            isConnectable={false}
          />
          {data.approvalIntent === 'contains-delete' ? (
            <span className="agent-approval-target-chip">{t('group.containsDelete')}</span>
          ) : data.approvalIntent === 'contains-disconnect' ? (
            <span className="agent-approval-target-chip">{t('group.containsDisconnect')}</span>
          ) : null}
        </Fragment>
      }
      selectionContent={
        !data.isEditing && (data.isSelected || data.isContextSelected) ? (
          <WorkbenchNodeSelectionVeil />
        ) : null
      }
      surfaceClassName={surfaceClassName}
      surfaceRef={objectMotion.surfaceRef}
      surfaceStyle={objectMotion.style}
      onSurfaceAnimationEnd={objectMotion.onAnimationEnd}
    />
  )
})
