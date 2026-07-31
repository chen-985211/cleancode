import type { Edge } from '@xyflow/react'

import type { TerminalWorkflowBuildPresentation } from './useTerminalWorkflowBuildChoreography'

export function projectTerminalWorkflowBuildOntoEdges(
  edges: readonly Edge[],
  presentation: TerminalWorkflowBuildPresentation | null
): Edge[] {
  if (!presentation) return [...edges]

  return edges.map((edge) => {
    const buildClassName = presentation.pendingConnectionIds.has(edge.id)
      ? 'terminal-workflow-edge--build-pending'
      : presentation.enteringConnectionIds.has(edge.id)
        ? 'terminal-workflow-edge--build-entering'
        : null

    return buildClassName
      ? { ...edge, className: [edge.className, buildClassName].filter(Boolean).join(' ') }
      : edge
  })
}
