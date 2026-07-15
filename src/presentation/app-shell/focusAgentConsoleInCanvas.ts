import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchFlowNode } from './types'

interface FocusAgentConsoleInCanvasInput {
  readonly agent: WorkspaceAgentSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly duration?: number
  readonly interpolate?: 'smooth' | 'linear'
  readonly resolveDuration?: (input: {
    readonly targetCenter: { readonly x: number; readonly y: number }
    readonly targetZoom: number
  }) => number
  readonly setSelectedAgentId: (agentId: string | null) => void
  readonly setSelectedTerminalBlockIds: (blockIds: string[]) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusAgentConsoleInCanvas({
  agent,
  reactFlowInstance,
  duration = 220,
  interpolate,
  resolveDuration,
  setSelectedAgentId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setHoveredTerminalBlockId
}: FocusAgentConsoleInCanvasInput): void {
  setSelectedAgentId(agent.agentId)
  setSelectedTerminalBlockIds([])
  setSelectedTerminalGroupId(null)
  setHoveredTerminalBlockId(null)

  if (!reactFlowInstance) {
    return
  }

  const node = reactFlowInstance.getNode(toAgentFlowNodeId(agent.agentId))
  const width =
    node?.measured?.width ?? resolveDimension(node?.style?.width) ?? agent.layout.size.width
  const height =
    node?.measured?.height ?? resolveDimension(node?.style?.height) ?? agent.layout.size.height
  const position = node?.position ?? agent.layout.position
  const targetCenter = {
    x: position.x + width / 2,
    y: position.y + height / 2
  }
  const targetZoom = Math.max(reactFlowInstance.getZoom(), 0.9)
  const transitionDuration = resolveDuration?.({ targetCenter, targetZoom }) ?? duration

  void reactFlowInstance.setCenter(targetCenter.x, targetCenter.y, {
    zoom: targetZoom,
    duration: transitionDuration,
    ...(interpolate ? { interpolate } : {})
  })
}

function resolveDimension(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsedValue = Number.parseFloat(value)

    return Number.isFinite(parsedValue) ? parsedValue : null
  }

  return null
}
