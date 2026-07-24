import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { toAgentFlowNodeId } from './agentConsoleFlowNode'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import { revealCreatedWorkbenchNode } from './revealCreatedWorkbenchNode'
import { scheduleWorkbenchNodeInputActivation } from './scheduleWorkbenchNodeInputActivation'
import type { WorkbenchFlowNode } from './types'
import { activateWorkbenchNodeInput } from './workbenchNodeInputActivation'

interface FocusAgentConsoleInCanvasInput {
  readonly activateAgentInput?: boolean
  readonly agent: WorkspaceAgentSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly duration?: number
  readonly interpolate?: 'smooth' | 'linear'
  readonly targetZoom?: number
  readonly viewportIntent?: 'creation' | 'navigation'
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
  activateAgentInput = false,
  agent,
  reactFlowInstance,
  duration = 220,
  interpolate,
  targetZoom,
  viewportIntent = 'navigation',
  resolveDuration,
  setSelectedAgentId,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  setHoveredTerminalBlockId
}: FocusAgentConsoleInCanvasInput): (() => void) | null {
  setSelectedAgentId(agent.agentId)
  setSelectedTerminalBlockIds([])
  setSelectedTerminalGroupId(null)
  setHoveredTerminalBlockId(null)

  if (!reactFlowInstance) {
    return null
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
  const transitionDuration =
    viewportIntent === 'creation'
      ? revealCreatedWorkbenchNode({
          ...readWorkbenchCanvasCreationGeometry(),
          duration,
          nodePosition: position,
          nodeSize: { height, width },
          reactFlowInstance
        })
      : revealNavigatedAgentConsole({
          duration,
          interpolate,
          reactFlowInstance,
          resolveDuration,
          targetCenter,
          targetZoom
        })

  if (!activateAgentInput) {
    return null
  }

  return scheduleWorkbenchNodeInputActivation({
    activate: () =>
      activateWorkbenchNodeInput(
        node ??
          ({
            id: toAgentFlowNodeId(agent.agentId),
            position,
            type: 'agentConsole'
          } as WorkbenchFlowNode)
      ),
    transitionDuration
  })
}

function revealNavigatedAgentConsole({
  duration,
  interpolate,
  reactFlowInstance,
  resolveDuration,
  targetCenter,
  targetZoom
}: {
  readonly duration: number
  readonly interpolate?: 'smooth' | 'linear'
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly resolveDuration?: FocusAgentConsoleInCanvasInput['resolveDuration']
  readonly targetCenter: { readonly x: number; readonly y: number }
  readonly targetZoom?: number
}): number {
  const nextZoom = targetZoom ?? Math.max(reactFlowInstance.getZoom(), 0.9)
  const transitionDuration = resolveDuration?.({ targetCenter, targetZoom: nextZoom }) ?? duration

  void reactFlowInstance.setCenter(targetCenter.x, targetCenter.y, {
    zoom: nextZoom,
    duration: transitionDuration,
    ...(interpolate ? { interpolate } : {})
  })

  return transitionDuration
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
