import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { AgentConsole } from './AgentConsole'
import { minimumAgentConsoleSize } from './agentConsoleFlowNode'
import type { AgentConsoleFlowNode } from './types'

export const AgentNode = memo(function AgentNode({
  data,
  selected
}: NodeProps<AgentConsoleFlowNode>) {
  const className = [
    'agent-console-node',
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
    >
      <NodeResizer
        isVisible={selected}
        minWidth={minimumAgentConsoleSize.width}
        minHeight={minimumAgentConsoleSize.height}
        color="var(--cc-muted)"
        handleClassName="agent-console-node__resize-handle nodrag"
        lineClassName="agent-console-node__resize-line"
        onResizeEnd={(_event, params) => {
          void data.onResize(data.agent, params.width, params.height)
        }}
      />
      <AgentConsole
        agent={data.agent}
        currentWorkbench={data.currentWorkbench}
        currentWorkspace={data.currentWorkspace}
        onGraphUpdated={data.onGraphUpdated}
        onRemove={data.onRemove}
        onRename={data.onRename}
      />
    </section>
  )
})
