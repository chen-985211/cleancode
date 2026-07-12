import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { AgentConsole } from './AgentConsole'
import { minimumAgentConsoleSize } from './agentConsoleFlowNode'
import type { AgentConsoleFlowNode } from './types'
import { WorkbenchNodeResizer } from './WorkbenchNodeResizer'
import { WorkbenchNodeSelectionVeil } from './WorkbenchNodeSelectionVeil'

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
      data-selection-state={selected ? 'selected' : 'unselected'}
    >
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
        currentWorkbench={data.currentWorkbench}
        currentWorkspace={data.currentWorkspace}
        onGraphUpdated={data.onGraphUpdated}
        onRemove={data.onRemove}
        onRename={data.onRename}
        onSelect={data.onSelect}
      />
      {selected ? <WorkbenchNodeSelectionVeil /> : null}
    </section>
  )
})
