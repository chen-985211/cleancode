import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkspaceAgentSnapshot } from '../../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import { toAgentFlowNodeId } from '../../projections/agentConsoleFlowNode'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import { revealCreatedWorkbenchNode } from '../creation/revealCreatedWorkbenchNode'
import { scheduleWorkbenchNodeInputActivation } from '../creation/scheduleWorkbenchNodeInputActivation'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import { workbenchNodeReadableZoom } from './workbenchNodeFocusViewport'
import {
  activateWorkbenchNodeInput,
  createWorkbenchNodeInputSurfaceReadiness
} from '../creation/workbenchNodeInputActivation'
import {
  transitionWorkbenchViewport,
  readWorkbenchViewportTargetZoom,
  type WorkbenchViewportCommand,
  type WorkbenchViewportMotionIntent
} from './workbenchViewportMotion'

interface FocusAgentConsoleInCanvasInput {
  readonly activateAgentInput?: boolean
  readonly agent: WorkspaceAgentSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly motion?: WorkbenchViewportMotionIntent
  readonly targetZoom?: number
  readonly viewportIntent?: 'creation' | 'navigation'
  readonly setSelectedAgentId: (agentId: string | null) => void
  readonly setSelectedTerminalBlockIds: (blockIds: string[]) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusAgentConsoleInCanvas({
  activateAgentInput = false,
  agent,
  reactFlowInstance,
  motion = { type: 'spatial' },
  targetZoom,
  viewportIntent = 'navigation',
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
  const transitionCompletion =
    viewportIntent === 'creation'
      ? revealCreatedWorkbenchNode({
          ...readWorkbenchCanvasCreationGeometry(),
          nodePosition: position,
          nodeSize: { height, width },
          reactFlowInstance
        })
      : revealNavigatedAgentConsole({
          motion,
          reactFlowInstance,
          targetCenter,
          targetZoom
        })

  if (!activateAgentInput) {
    return null
  }

  const focusTarget =
    node ??
    ({
      id: toAgentFlowNodeId(agent.agentId),
      position,
      type: 'agentConsole'
    } as WorkbenchFlowNode)
  const inputReadiness =
    viewportIntent === 'creation' ? createWorkbenchNodeInputSurfaceReadiness(focusTarget) : null
  const readinessOptions = inputReadiness
    ? {
        isReady: inputReadiness.isReady,
        observeReadiness: inputReadiness.observe
      }
    : {}

  return scheduleWorkbenchNodeInputActivation({
    activate: () => activateWorkbenchNodeInput(focusTarget),
    ...readinessOptions,
    transitionCompletion
  })
}

function revealNavigatedAgentConsole({
  motion,
  reactFlowInstance,
  targetCenter,
  targetZoom
}: {
  readonly motion: WorkbenchViewportMotionIntent
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly targetCenter: { readonly x: number; readonly y: number }
  readonly targetZoom?: number
}): Promise<boolean> {
  const nextZoom =
    targetZoom ??
    Math.max(readWorkbenchViewportTargetZoom(reactFlowInstance), workbenchNodeReadableZoom)
  const command = {
    center: targetCenter,
    intent: motion,
    type: 'center',
    zoom: nextZoom
  } satisfies WorkbenchViewportCommand
  return transitionWorkbenchViewport(reactFlowInstance, command)
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
