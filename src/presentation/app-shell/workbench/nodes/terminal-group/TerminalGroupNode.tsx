import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Fragment, memo, useCallback } from 'react'

import type { TerminalBlockSnapshot } from '../../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  TerminalGroupCard,
  TerminalGroupMemberRow
} from '../../../../../contexts/block-graph/presentation/components/TerminalGroupCard'
import { useTerminalGroupDropSpring } from '../../../../../contexts/block-graph/presentation/motion/useTerminalGroupDropSpring'
import { useTerminalState } from '../../../../../contexts/run/presentation/view-models/terminalStateStore'
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
    data.onObjectMotionComplete
  )
  const dropSpringSurfaceRef = useTerminalGroupDropSpring(data.dropFeedback)
  const objectMotionSurfaceRef = objectMotion.surfaceRef
  const motionSurfaceRef = useCallback(
    (surface: HTMLElement | null) => {
      dropSpringSurfaceRef(surface)
      objectMotionSurfaceRef(surface)
    },
    [dropSpringSurfaceRef, objectMotionSurfaceRef]
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
      isExpanding={data.objectMotion?.kind === 'group-expand'}
      isPending={isPending}
      leadingContent={
        <Fragment>
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
      memberRows={data.memberBlocks.map((block) => (
        <TerminalGroupMemberRowAdapter key={block.id} block={block} data={data} />
      ))}
      selectionContent={
        !data.isEditing && (data.isSelected || data.isContextSelected) ? (
          <WorkbenchNodeSelectionVeil />
        ) : null
      }
      surfaceClassName={surfaceClassName}
      surfaceRef={motionSurfaceRef}
      surfaceStyle={objectMotion.style}
      onSurfaceAnimationEnd={objectMotion.onAnimationEnd}
    />
  )
})

function TerminalGroupMemberRowAdapter({
  block,
  data
}: {
  readonly block: TerminalBlockSnapshot
  readonly data: TerminalGroupFlowNode['data']
}) {
  const { t } = useI18n()
  const status = useTerminalState(
    data.terminalStateStore,
    block.id,
    data.memberStates[block.id]
  ).status

  return (
    <TerminalGroupMemberRow
      block={block}
      status={status}
      statusLabel={t(`terminal.status.${status}`)}
      onRemove={() => void data.onRemoveTerminalFromGroup(data.group, block)}
    />
  )
}
