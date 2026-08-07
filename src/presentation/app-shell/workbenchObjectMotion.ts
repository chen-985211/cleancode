import type { Edge } from '@xyflow/react'

import { resolveNodeSize } from './resolveNodeSize'
import type { WorkbenchFlowNode, WorkbenchObjectMotion, WorkbenchObjectMotionKind } from './types'

export type WorkbenchCanvasDetailLevel = 'compact' | 'full' | 'overview'

interface ProjectWorkbenchObjectMotionInput {
  readonly createMotionId: (kind: WorkbenchObjectMotionKind, nodeId: string) => string
  readonly currentNodes: readonly WorkbenchFlowNode[]
  readonly isContinuingGraph: boolean
  readonly nextNodes: readonly WorkbenchFlowNode[]
  readonly reducedMotion: boolean
}

interface WorkbenchObjectMotionProjection {
  readonly exitingNodes: readonly WorkbenchFlowNode[]
  readonly nodes: readonly WorkbenchFlowNode[]
}

interface WorkbenchObjectFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

const compactCanvasZoom = 0.78
const overviewCanvasZoom = 0.52

export function resolveWorkbenchCanvasDetailLevel(
  zoom: number,
  reduceVisualNoise = true
): WorkbenchCanvasDetailLevel {
  if (!reduceVisualNoise) return 'full'
  if (!Number.isFinite(zoom) || zoom <= 0 || zoom >= compactCanvasZoom) {
    return 'full'
  }
  return zoom >= overviewCanvasZoom ? 'compact' : 'overview'
}

export function projectWorkbenchObjectMotionOntoEdges(
  edges: Edge[],
  nodes: readonly WorkbenchFlowNode[]
): Edge[] {
  const movingNodeIds = new Set(
    nodes
      .filter(
        (node) =>
          node.data.objectMotion?.kind === 'group-expand' ||
          node.data.objectMotion?.kind === 'group-join' ||
          node.data.objectMotion?.kind === 'group-leave' ||
          node.data.objectMotion?.kind === 'group-reflow'
      )
      .map((node) => node.id)
  )
  if (movingNodeIds.size === 0) return edges

  return edges.map((edge) => {
    const isMotionPending = movingNodeIds.has(edge.source) || movingNodeIds.has(edge.target)
    if (!isMotionPending) return edge

    const classNames = new Set(edge.className?.split(/\s+/).filter(Boolean) ?? [])
    classNames.add('workbench-object-edge--motion-pending')

    return { ...edge, className: [...classNames].join(' ') }
  })
}

export function scheduleWorkbenchCreatedObjectFocus(
  focus: () => void,
  scheduler: WorkbenchObjectFrameScheduler = {
    cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
    requestFrame: (callback) => window.requestAnimationFrame(callback)
  }
): () => void {
  let isCancelled = false
  let presentationFrameId: number | null = null
  const projectionFrameId = scheduler.requestFrame(() => {
    if (isCancelled) return
    presentationFrameId = scheduler.requestFrame(() => {
      if (!isCancelled) focus()
    })
  })

  return () => {
    isCancelled = true
    scheduler.cancelFrame(projectionFrameId)
    if (presentationFrameId !== null) scheduler.cancelFrame(presentationFrameId)
  }
}

export function projectWorkbenchObjectMotion({
  createMotionId,
  currentNodes,
  isContinuingGraph,
  nextNodes,
  reducedMotion
}: ProjectWorkbenchObjectMotionInput): WorkbenchObjectMotionProjection {
  if (!isContinuingGraph || reducedMotion) {
    return { exitingNodes: [], nodes: nextNodes }
  }

  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]))
  const nextNodesById = new Map(nextNodes.map((node) => [node.id, node]))
  const expandingMemberOrigins = resolveExpandingMemberOrigins(currentNodesById, nextNodes)
  const membershipMotion = resolveGroupMembershipMotion(currentNodesById, nextNodes)
  const nodes = nextNodes.map((node) => {
    if (node.type === 'terminalGroup' && membershipMotion.acceptingGroupIds.has(node.id)) {
      return withObjectMotion(
        node,
        createObjectMotion('group-accept', node.id, { x: 0, y: 0 }, createMotionId)
      )
    }

    if (node.type === 'terminal' && membershipMotion.joinedMemberIds.has(node.id)) {
      const currentNode = currentNodesById.get(node.id)
      return withObjectMotion(
        node,
        createObjectMotion(
          'group-join',
          node.id,
          currentNode ? resolveOffsetFromNode(node, currentNode) : { x: 0, y: 0 },
          createMotionId
        )
      )
    }

    if (node.type === 'terminal' && membershipMotion.reflowedMemberIds.has(node.id)) {
      const currentNode = currentNodesById.get(node.id)
      if (!currentNode) return node
      const offset = resolveOffsetFromNode(node, currentNode)
      if (offset.x === 0 && offset.y === 0) return node

      return withObjectMotion(
        node,
        createObjectMotion('group-reflow', node.id, offset, createMotionId)
      )
    }

    if (node.type === 'terminal' && membershipMotion.departedMemberIds.has(node.id)) {
      const currentNode = currentNodesById.get(node.id)
      if (!currentNode) return node
      const offset = resolveOffsetFromNode(node, currentNode)
      if (offset.x === 0 && offset.y === 0) return node

      return withObjectMotion(
        node,
        createObjectMotion('group-leave', node.id, offset, createMotionId)
      )
    }

    if (currentNodesById.has(node.id) || isWorkflowBuildNode(node)) {
      return node
    }

    const origin = expandingMemberOrigins.get(node.id)
    return withObjectMotion(
      node,
      createObjectMotion(
        origin ? 'group-expand' : 'create',
        node.id,
        origin ? resolveOffsetFromOrigin(node, origin) : { x: 0, y: 0 },
        createMotionId
      )
    )
  })
  const exitingNodes = resolveCollapsingMemberExits({
    createMotionId,
    currentNodesById,
    nextNodes,
    nextNodesById
  })

  return { exitingNodes, nodes }
}

function resolveGroupMembershipMotion(
  currentNodesById: ReadonlyMap<string, WorkbenchFlowNode>,
  nextNodes: readonly WorkbenchFlowNode[]
): {
  readonly acceptingGroupIds: ReadonlySet<string>
  readonly departedMemberIds: ReadonlySet<string>
  readonly joinedMemberIds: ReadonlySet<string>
  readonly reflowedMemberIds: ReadonlySet<string>
} {
  const acceptingGroupIds = new Set<string>()
  const departedMemberIds = new Set<string>()
  const joinedMemberIds = new Set<string>()
  const reflowedMemberIds = new Set<string>()

  nextNodes.forEach((node) => {
    if (node.type !== 'terminalGroup') return
    const currentNode = currentNodesById.get(node.id)
    if (currentNode?.type !== 'terminalGroup') return

    const currentMemberIds = new Set(currentNode.data.group.memberBlockIds)
    const nextMemberIds = new Set(node.data.group.memberBlockIds)
    const addedMemberIds = node.data.group.memberBlockIds.filter(
      (memberBlockId) => !currentMemberIds.has(memberBlockId)
    )
    const hasRemovedMembers = currentNode.data.group.memberBlockIds.some(
      (memberBlockId) => !nextMemberIds.has(memberBlockId)
    )
    if (addedMemberIds.length === 0 && !hasRemovedMembers) return

    if (addedMemberIds.length > 0) acceptingGroupIds.add(node.id)
    addedMemberIds.forEach((memberBlockId) => joinedMemberIds.add(memberBlockId))
    currentNode.data.group.memberBlockIds.forEach((memberBlockId) => {
      if (!nextMemberIds.has(memberBlockId)) departedMemberIds.add(memberBlockId)
    })
    node.data.group.memberBlockIds.forEach((memberBlockId) => {
      if (currentMemberIds.has(memberBlockId)) reflowedMemberIds.add(memberBlockId)
    })
  })

  return { acceptingGroupIds, departedMemberIds, joinedMemberIds, reflowedMemberIds }
}

function resolveExpandingMemberOrigins(
  currentNodesById: ReadonlyMap<string, WorkbenchFlowNode>,
  nextNodes: readonly WorkbenchFlowNode[]
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const origins = new Map<string, { readonly x: number; readonly y: number }>()

  nextNodes.forEach((node) => {
    if (node.type !== 'terminalGroup' || node.data.group.isCollapsed) return
    const currentNode = currentNodesById.get(node.id)
    if (currentNode?.type !== 'terminalGroup' || !currentNode.data.group.isCollapsed) {
      return
    }

    const origin = resolveNodeCenter(currentNode)
    node.data.group.memberBlockIds.forEach((memberBlockId) => origins.set(memberBlockId, origin))
  })

  return origins
}

function resolveCollapsingMemberExits({
  createMotionId,
  currentNodesById,
  nextNodes,
  nextNodesById
}: {
  readonly createMotionId: ProjectWorkbenchObjectMotionInput['createMotionId']
  readonly currentNodesById: ReadonlyMap<string, WorkbenchFlowNode>
  readonly nextNodes: readonly WorkbenchFlowNode[]
  readonly nextNodesById: ReadonlyMap<string, WorkbenchFlowNode>
}): WorkbenchFlowNode[] {
  const exitingNodes: WorkbenchFlowNode[] = []

  nextNodes.forEach((node) => {
    if (node.type !== 'terminalGroup' || !node.data.group.isCollapsed) return
    const currentNode = currentNodesById.get(node.id)
    if (currentNode?.type !== 'terminalGroup' || currentNode.data.group.isCollapsed) return

    const origin = resolveNodeCenter(node)
    node.data.group.memberBlockIds.forEach((memberBlockId) => {
      if (nextNodesById.has(memberBlockId)) return
      const memberNode = currentNodesById.get(memberBlockId)
      if (memberNode?.type !== 'terminal') return

      exitingNodes.push(
        withObjectMotion(
          memberNode,
          createObjectMotion(
            'group-collapse',
            memberNode.id,
            resolveOffsetFromOrigin(memberNode, origin),
            createMotionId
          )
        )
      )
    })
  })

  return exitingNodes
}

function createObjectMotion(
  kind: WorkbenchObjectMotionKind,
  nodeId: string,
  offset: WorkbenchObjectMotion['offset'],
  createMotionId: ProjectWorkbenchObjectMotionInput['createMotionId']
): WorkbenchObjectMotion {
  return { id: createMotionId(kind, nodeId), kind, offset }
}

function withObjectMotion(
  node: WorkbenchFlowNode,
  objectMotion: WorkbenchObjectMotion
): WorkbenchFlowNode {
  return {
    ...node,
    data: { ...node.data, objectMotion }
  } as WorkbenchFlowNode
}

function resolveOffsetFromOrigin(
  node: WorkbenchFlowNode,
  origin: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } {
  const center = resolveNodeCenter(node)
  return { x: origin.x - center.x, y: origin.y - center.y }
}

function resolveOffsetFromNode(
  node: WorkbenchFlowNode,
  currentNode: WorkbenchFlowNode
): { readonly x: number; readonly y: number } {
  return resolveOffsetFromOrigin(node, resolveNodeCenter(currentNode))
}

function resolveNodeCenter(node: WorkbenchFlowNode): { readonly x: number; readonly y: number } {
  const fallbackSize =
    node.type === 'terminal'
      ? node.data.block.size
      : node.type === 'terminalGroup'
        ? node.data.group.size
        : node.data.agent.layout.size
  const width = resolveNodeSize(node.style?.width, node.measured?.width ?? fallbackSize.width)
  const height = resolveNodeSize(node.style?.height, node.measured?.height ?? fallbackSize.height)

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2
  }
}

function isWorkflowBuildNode(node: WorkbenchFlowNode): boolean {
  return typeof node.className === 'string' && node.className.startsWith('terminal-workflow-build-')
}
