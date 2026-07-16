import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { AgentConsole } from './AgentConsole'
import { agentApprovalSourceHandleId } from './agentApprovalHandles'
import { minimumAgentConsoleSize } from './agentConsoleFlowNode'
import type { AgentConsoleFlowNode } from './types'
import type { AgentToolApprovalController } from './agentToolApprovalTypes'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'

export const AgentNode = memo(function AgentNode({
  data,
  selected
}: NodeProps<AgentConsoleFlowNode>) {
  const approvalController = data.approvalController ?? inactiveApprovalController
  const hasActiveApproval = approvalController.approvals.some(
    (approval) => approval.request.agentId === data.agent.agentId
  )
  const className = [
    'agent-console-node',
    hasActiveApproval ? 'agent-console-node--approval-source' : '',
    'nowheel',
    selected ? 'agent-console-node--selected' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={className}
      role="region"
      aria-label={`${data.agent.name} 控制台`}
      data-agent-console-node={data.agent.agentId}
      data-approval-state={hasActiveApproval ? 'pending' : 'idle'}
      data-selection-state={selected ? 'selected' : 'unselected'}
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
        onSelect={data.onSelect}
      />
      {selected ? <WorkbenchNodeSelectionVeil /> : null}
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
