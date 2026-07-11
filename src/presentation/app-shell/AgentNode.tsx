import { NodeResizer, type NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { AgentConsole } from './AgentConsole'
import { minimumAgentConsoleSize } from './agentConsoleFlowNode'
import type { AgentConsoleFlowNode } from './types'

export const AgentNode = memo(function AgentNode({
  data,
  selected
}: NodeProps<AgentConsoleFlowNode>) {
  const className = ['agent-console-node', selected ? 'agent-console-node--selected' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <section
      className={className}
      role="region"
      aria-label="Codex Agent 控制台"
      data-agent-console-node
    >
      <NodeResizer
        isVisible={selected}
        minWidth={minimumAgentConsoleSize.width}
        minHeight={minimumAgentConsoleSize.height}
        color="#94a3b8"
        handleClassName="agent-console-node__resize-handle nodrag"
        lineClassName="agent-console-node__resize-line"
      />
      <AgentConsole
        currentWorkbench={data.currentWorkbench}
        currentWorkspace={data.currentWorkspace}
        onGraphUpdated={data.onGraphUpdated}
      />
    </section>
  )
})
