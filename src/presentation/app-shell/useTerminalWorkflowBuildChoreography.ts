import { useCallback, useEffect, useRef, useState } from 'react'

import type { AgentGraphUpdatedEvent } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import { resolveNodeSize } from './resolveNodeSize'
import {
  createTerminalWorkflowBuildChoreography,
  type TerminalWorkflowBuildChoreography
} from './terminalWorkflowBuildChoreography'
import type { WorkbenchFlowNode } from './types'
import type { WorkbenchNodeStore } from './workbenchNodeStore'
import { prefersReducedMotion, subscribeReducedMotionPreference } from './motionPreference'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'

export interface TerminalWorkflowBuildPresentation {
  readonly enteringConnectionIds: ReadonlySet<string>
  readonly enteringTerminalBlockIds: ReadonlySet<string>
  readonly enteringTerminalGroupIds: ReadonlySet<string>
  readonly operationId: string
  readonly initialPositionsByBlockId?: ReadonlyMap<
    string,
    { readonly x: number; readonly y: number }
  >
  readonly pendingConnectionIds: ReadonlySet<string>
  readonly pendingTerminalBlockIds: ReadonlySet<string>
  readonly pendingTerminalGroupIds: ReadonlySet<string>
  readonly terminalBlockIds: ReadonlySet<string>
}

interface ActiveBuild {
  readonly choreography: TerminalWorkflowBuildChoreography
  readonly interruptedNodeIds: Set<string>
  isStarted: boolean
  presentationSignature: string
  startedAt: number | null
}

export function useTerminalWorkflowBuildChoreography({
  currentProjectId,
  currentWorkspaceId,
  nodeStore,
  terminalWorkflowBuildMode
}: {
  readonly currentProjectId: string | null
  readonly currentWorkspaceId: string | null
  readonly nodeStore: WorkbenchNodeStore
  readonly terminalWorkflowBuildMode: TerminalWorkflowBuildMode
}) {
  const [presentation, setPresentation] = useState<TerminalWorkflowBuildPresentation | null>(null)
  const activeBuildRef = useRef<ActiveBuild | null>(null)
  const animationFrameRef = useRef(0)

  const cancelActiveBuild = useCallback(
    (settle: boolean): void => {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = 0
      const activeBuild = activeBuildRef.current
      activeBuildRef.current = null

      if (settle && activeBuild) {
        const targetByBlockId = new Map(
          activeBuild.choreography.terminalStages.map((stage) => [
            stage.blockId,
            stage.targetPosition
          ])
        )
        nodeStore.setNodes((nodes) =>
          updateAnimatedNodePositions(nodes, targetByBlockId, activeBuild.interruptedNodeIds)
        )
      }
      setPresentation(null)
    },
    [nodeStore]
  )

  const begin = useCallback(
    (event: AgentGraphUpdatedEvent, originNodeId?: string): void => {
      cancelActiveBuild(true)
      if (event.change?.kind !== 'terminal_build_created') return

      const createdNodeIds = new Set([...event.change.blockIds, ...event.change.terminalGroupIds])
      const canvasNodes = nodeStore
        .getNodes()
        .filter((node) => !createdNodeIds.has(node.id))
        .flatMap(resolveCanvasNodeLayout)
      const choreography = createTerminalWorkflowBuildChoreography({
        canvasNodes,
        change: event.change,
        graph: event.graph,
        mode: terminalWorkflowBuildMode,
        originNodeId,
        reducedMotion: prefersReducedMotion()
      })

      if (!choreography || choreography.reducedMotion) return

      const activeBuild: ActiveBuild = {
        choreography,
        interruptedNodeIds: new Set(),
        isStarted: false,
        presentationSignature: '',
        startedAt: null
      }
      activeBuildRef.current = activeBuild
      projectAwaitingFocusPresentation(activeBuild, setPresentation)
    },
    [cancelActiveBuild, nodeStore, terminalWorkflowBuildMode]
  )

  const start = useCallback(
    (operationId?: string): void => {
      const activeBuild = activeBuildRef.current
      if (
        !activeBuild ||
        activeBuild.isStarted ||
        (operationId !== undefined && activeBuild.choreography.operationId !== operationId)
      ) {
        return
      }

      activeBuild.isStarted = true
      projectPresentation(activeBuild, 0, setPresentation)

      const animate = (timestamp: number): void => {
        if (activeBuildRef.current !== activeBuild) return
        const projectedNodeIds = new Set(nodeStore.getNodes().map((node) => node.id))
        if (
          !activeBuild.choreography.terminalStages.every((stage) =>
            projectedNodeIds.has(stage.blockId)
          )
        ) {
          animationFrameRef.current = window.requestAnimationFrame(animate)
          return
        }

        activeBuild.startedAt ??= timestamp
        const elapsedMs = Math.max(0, timestamp - activeBuild.startedAt)
        const positionsByBlockId = new Map(
          activeBuild.choreography.terminalStages.map((stage) => [
            stage.blockId,
            resolveAnimatedPosition(stage, elapsedMs)
          ])
        )
        nodeStore.setNodes((nodes) =>
          updateAnimatedNodePositions(nodes, positionsByBlockId, activeBuild.interruptedNodeIds)
        )
        projectPresentation(activeBuild, elapsedMs, setPresentation)

        if (elapsedMs >= activeBuild.choreography.totalDurationMs) {
          activeBuildRef.current = null
          animationFrameRef.current = 0
          setPresentation(null)
          return
        }

        animationFrameRef.current = window.requestAnimationFrame(animate)
      }

      animationFrameRef.current = window.requestAnimationFrame(animate)
    },
    [nodeStore]
  )

  const interruptNodes = useCallback((nodeIds: readonly string[]): void => {
    const activeBuild = activeBuildRef.current
    if (!activeBuild) return
    nodeIds.forEach((nodeId) => activeBuild.interruptedNodeIds.add(nodeId))
  }, [])

  useEffect(() => {
    cancelActiveBuild(false)
  }, [cancelActiveBuild, currentProjectId, currentWorkspaceId])

  useEffect(() => {
    return subscribeReducedMotionPreference((reducedMotion) => {
      if (reducedMotion) cancelActiveBuild(true)
    })
  }, [cancelActiveBuild])

  useEffect(
    () => () => {
      window.cancelAnimationFrame(animationFrameRef.current)
      activeBuildRef.current = null
    },
    []
  )

  return { begin, interruptNodes, presentation, start }
}

function resolveCanvasNodeLayout(node: WorkbenchFlowNode): Array<{
  readonly nodeId: string
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly height: number; readonly width: number }
}> {
  const persistedSize =
    node.type === 'terminal'
      ? node.data.block.size
      : node.type === 'terminalGroup'
        ? node.data.group.size
        : node.type === 'agentConsole'
          ? node.data.agent.layout.size
          : null
  if (!persistedSize) return []

  return [
    {
      nodeId: node.id,
      position: node.position,
      size: {
        height: resolveNodeSize(node.style?.height, persistedSize.height),
        width: resolveNodeSize(node.style?.width, persistedSize.width)
      }
    }
  ]
}

function projectAwaitingFocusPresentation(
  activeBuild: ActiveBuild,
  setPresentation: (presentation: TerminalWorkflowBuildPresentation | null) => void
): void {
  const { choreography } = activeBuild
  activeBuild.presentationSignature = 'awaiting-focus'
  setPresentation({
    enteringConnectionIds: new Set(),
    enteringTerminalBlockIds: new Set(),
    enteringTerminalGroupIds: new Set(),
    initialPositionsByBlockId: new Map(
      choreography.terminalStages.map((stage) => [stage.blockId, stage.initialPosition])
    ),
    operationId: choreography.operationId,
    pendingConnectionIds: new Set(choreography.connectionStages.map((stage) => stage.connectionId)),
    pendingTerminalBlockIds: new Set(choreography.terminalStages.map((stage) => stage.blockId)),
    pendingTerminalGroupIds: new Set(
      choreography.groupStages.map((stage) => stage.terminalGroupId)
    ),
    terminalBlockIds: new Set(choreography.terminalStages.map((stage) => stage.blockId))
  })
}

function resolveAnimatedPosition(
  stage: TerminalWorkflowBuildChoreography['terminalStages'][number],
  elapsedMs: number
): { readonly x: number; readonly y: number } {
  const stageElapsedMs = elapsedMs - stage.delayMs
  if (stageElapsedMs <= 0) return stage.initialPosition
  const progress = criticallyDampedProgress(Math.min(1, stageElapsedMs / stage.durationMs))
  return {
    x: interpolate(stage.initialPosition.x, stage.targetPosition.x, progress),
    y: interpolate(stage.initialPosition.y, stage.targetPosition.y, progress)
  }
}

function criticallyDampedProgress(normalizedTime: number): number {
  if (normalizedTime >= 1) return 1
  const scaledTime = normalizedTime * 8
  return 1 - (1 + scaledTime) * Math.exp(-scaledTime)
}

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

function updateAnimatedNodePositions(
  nodes: WorkbenchFlowNode[],
  positionsByBlockId: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  interruptedNodeIds: ReadonlySet<string>
): WorkbenchFlowNode[] {
  let didChange = false
  const nextNodes = nodes.map((node): WorkbenchFlowNode => {
    const position = positionsByBlockId.get(node.id)
    if (!position || interruptedNodeIds.has(node.id) || node.type !== 'terminal') return node
    if (node.position.x === position.x && node.position.y === position.y) return node
    didChange = true
    return { ...node, position }
  })
  return didChange ? nextNodes : nodes
}

function projectPresentation(
  activeBuild: ActiveBuild,
  elapsedMs: number,
  setPresentation: (presentation: TerminalWorkflowBuildPresentation | null) => void
): void {
  const pendingConnectionIds = activeBuild.choreography.connectionStages
    .filter((stage) => elapsedMs < stage.revealAtMs)
    .map((stage) => stage.connectionId)
  const enteringConnectionIds = activeBuild.choreography.connectionStages
    .filter((stage) => elapsedMs >= stage.revealAtMs)
    .map((stage) => stage.connectionId)
  const pendingTerminalBlockIds = activeBuild.choreography.terminalStages
    .filter((stage) => elapsedMs < stage.delayMs)
    .map((stage) => stage.blockId)
  const enteringTerminalBlockIds = activeBuild.choreography.terminalStages
    .filter((stage) => elapsedMs >= stage.delayMs)
    .map((stage) => stage.blockId)
  const pendingTerminalGroupIds = activeBuild.choreography.groupStages
    .filter((stage) => elapsedMs < stage.revealAtMs)
    .map((stage) => stage.terminalGroupId)
  const enteringTerminalGroupIds = activeBuild.choreography.groupStages
    .filter((stage) => elapsedMs >= stage.revealAtMs)
    .map((stage) => stage.terminalGroupId)
  const signature = [
    pendingConnectionIds.join(','),
    enteringConnectionIds.join(','),
    pendingTerminalBlockIds.join(','),
    enteringTerminalBlockIds.join(','),
    pendingTerminalGroupIds.join(','),
    enteringTerminalGroupIds.join(',')
  ].join('|')
  if (signature === activeBuild.presentationSignature) return
  activeBuild.presentationSignature = signature
  setPresentation({
    enteringConnectionIds: new Set(enteringConnectionIds),
    enteringTerminalBlockIds: new Set(enteringTerminalBlockIds),
    enteringTerminalGroupIds: new Set(enteringTerminalGroupIds),
    initialPositionsByBlockId: new Map(
      activeBuild.choreography.terminalStages.map((stage) => [stage.blockId, stage.initialPosition])
    ),
    operationId: activeBuild.choreography.operationId,
    pendingConnectionIds: new Set(pendingConnectionIds),
    pendingTerminalBlockIds: new Set(pendingTerminalBlockIds),
    pendingTerminalGroupIds: new Set(pendingTerminalGroupIds),
    terminalBlockIds: new Set(activeBuild.choreography.terminalStages.map((stage) => stage.blockId))
  })
}
