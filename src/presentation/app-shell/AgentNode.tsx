import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { AgentConsole } from './AgentConsole'
import { agentApprovalSourceHandleId } from './agentApprovalHandles'
import { minimumAgentConsoleSize } from './projections/agentConsoleFlowNode'
import type { AgentConsoleFlowNode } from './types/agentConsoleFlowNode'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'
import { useI18n } from '../i18n/useI18n'
import { useWorkbenchObjectMotionPresentation } from './useWorkbenchObjectMotionPresentation'

export const AgentNode = memo(function AgentNode({
  data,
  selected
}: NodeProps<AgentConsoleFlowNode>) {
  const { t } = useI18n()
  const approvalController = data.approvalController ?? inactiveApprovalController
  const objectMotion = useWorkbenchObjectMotionPresentation(
    data.objectMotion,
    data.onObjectMotionComplete
  )
  const isPresenceExit = data.objectMotion?.kind === 'delete'
  const hasActiveApproval = approvalController.approvals.some(
    (approval) => approval.request.agentId === data.agent.agentId
  )
  const className = [
    'agent-console-node',
    objectMotion.className,
    hasActiveApproval ? 'agent-console-node--approval-source' : '',
    'nowheel',
    selected ? 'agent-console-node--selected' : '',
    data.isContextSelected ? 'agent-console-node--context-selected' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      ref={objectMotion.surfaceRef}
      className={className}
      role="region"
      aria-label={t('agent.consoleRegion', { agentName: data.agent.name })}
      data-agent-console-node={data.agent.agentId}
      data-approval-state={hasActiveApproval ? 'pending' : 'idle'}
      data-context-selected={data.isContextSelected || undefined}
      data-selection-state={selected ? 'selected' : 'unselected'}
      aria-hidden={isPresenceExit || undefined}
      inert={isPresenceExit || undefined}
      style={objectMotion.style}
      onAnimationEnd={objectMotion.onAnimationEnd}
    >
      <Handle
        id={agentApprovalSourceHandleId}
        className="agent-approval-intent-handle agent-approval-intent-handle--source"
        type="source"
        position={Position.Right}
        isConnectable={false}
      />
      <WorkbenchNodeResizer
        minWidth={minimumAgentConsoleSize.width}
        minHeight={minimumAgentConsoleSize.height}
        className="agent-console-node__resize-handle nodrag"
        onResizeEnd={(_event, params) => {
          void data.onResize(data.agent, {
            position: { x: Math.round(params.x), y: Math.round(params.y) },
            size: { width: Math.round(params.width), height: Math.round(params.height) }
          })
        }}
      />
      <AgentConsole
        agent={data.agent}
        approvalController={approvalController}
        currentWorkbench={data.currentWorkbench}
        currentWorkspace={data.currentWorkspace}
        onGraphUpdated={data.onGraphUpdated}
        onMcpCapabilityChange={data.onMcpCapabilityChange}
        onRemove={data.onRemove}
        onRename={data.onRename}
        onSelect={() => data.onSelect?.(data.agent.agentId)}
      />
      {selected || data.isContextSelected ? <WorkbenchNodeSelectionVeil /> : null}
    </section>
  )
})

const inactiveApprovalController: AgentToolApprovalController = {
  approvals: [],
  approve: async () => undefined,
  clearForAgent: () => undefined,
  dismiss: () => undefined,
  locate: () => undefined,
  reject: async () => undefined
}
