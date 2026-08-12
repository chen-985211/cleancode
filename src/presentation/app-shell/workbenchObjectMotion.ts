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
const groupMemberCollapsedScale = 0.88
const groupMemberOpacityDelayMs = 160
const groupMemberContentDelayMs = 220

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
  const expandingMemberMotions = resolveExpandingMemberMotions(currentNodesById, nextNodes)
  const membershipMotion = resolveGroupMembershipMotion(currentNodesById, nextNodes)
  const nodes = nextNodes.map((node) => {
    if (node.type === 'terminalGroup') {
      const currentNode = currentNodesById.get(node.id)
      if (
        currentNode?.type === 'terminalGroup' &&
        currentNode.data.group.isCollapsed !== node.data.group.isCollapsed
      ) {
        return withObjectMotion(node, createGroupShellMotion(currentNode, node, createMotionId))
      }
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

    const expandingMemberMotion = expandingMemberMotions.get(node.id)
    const currentNode = currentNodesById.get(node.id)
    if (
      node.type === 'terminal' &&
      expandingMemberMotion &&
      currentNode?.type === 'terminal' &&
      (currentNode.data.objectMotion?.kind === 'group-collapse' ||
        currentNode.data.isParkedInCollapsedGroup)
    ) {
      return withObjectMotion(
        node,
        createGroupMemberMotion(
          'group-expand',
          node,
          expandingMemberMotion.origin,
          expandingMemberMotion.delayMs,
          createMotionId
        )
      )
    }

    if (currentNode || isWorkflowBuildNode(node)) {
      return node
    }

    const motion = createObjectMotion(
      expandingMemberMotion ? 'group-expand' : 'create',
      node.id,
      expandingMemberMotion
        ? resolveOffsetFromOrigin(node, expandingMemberMotion.origin)
        : { x: 0, y: 0 },
      createMotionId
    )

    return withObjectMotion(
      node,
      expandingMemberMotion
        ? {
            ...motion,
            contentDelayMs: groupMemberContentDelayMs,
            contentOpacity: { from: 0, to: 1 },
            delayMs: 0,
            opacity: { from: 0, to: 1 },
            opacityDelayMs: groupMemberOpacityDelayMs,
            scale: { from: groupMemberCollapsedScale, to: 1 }
          }
        : node.type !== 'terminalGroup'
          ? { ...motion, scale: { from: 0, to: 1 } }
          : motion
    )
  })
  const collapsingMemberExits = resolveCollapsingMemberExits({
    createMotionId,
    currentNodesById,
    nextNodes,
    nextNodesById
  })
  const collapsingMemberIds = new Set(collapsingMemberExits.map((node) => node.id))
  const deletedObjectExits = resolveDeletedObjectExits({
    collapsingMemberIds,
    createMotionId,
    currentNodes,
    nextNodesById
  })

  return { exitingNodes: [...collapsingMemberExits, ...deletedObjectExits], nodes }
}

function createGroupShellMotion(
  currentNode: Extract<WorkbenchFlowNode, { readonly type: 'terminalGroup' }>,
  nextNode: Extract<WorkbenchFlowNode, { readonly type: 'terminalGroup' }>,
  createMotionId: ProjectWorkbenchObjectMotionInput['createMotionId']
): WorkbenchObjectMotion {
  const kind = nextNode.data.group.isCollapsed ? 'group-collapse' : 'group-expand'

  return {
    ...createObjectMotion(kind, nextNode.id, { x: 0, y: 0 }, createMotionId),
    contentOpacity: { from: 0, to: 1 },
    opacity: { from: 1, to: 1 },
    shellRect: { from: resolveNodeRect(currentNode), to: resolveNodeRect(nextNode) }
  }
}

function createGroupMemberMotion(
  kind: 'group-collapse' | 'group-expand',
  node: Extract<WorkbenchFlowNode, { readonly type: 'terminal' }>,
  origin: { readonly x: number; readonly y: number },
  delayMs: number,
  createMotionId: ProjectWorkbenchObjectMotionInput['createMotionId']
): WorkbenchObjectMotion {
  return {
    ...createObjectMotion(kind, node.id, resolveOffsetFromOrigin(node, origin), createMotionId),
    delayMs,
    ...(kind === 'group-expand'
      ? {
          contentDelayMs: groupMemberContentDelayMs,
          contentOpacity: { from: 0, to: 1 },
          opacity: { from: 0, to: 1 },
          opacityDelayMs: groupMemberOpacityDelayMs,
          scale: { from: groupMemberCollapsedScale, to: 1 }
        }
      : { opacity: { from: 0, to: 0 } })
  }
}

function resolveGroupMembershipMotion(
  currentNodesById: ReadonlyMap<string, WorkbenchFlowNode>,
  nextNodes: readonly WorkbenchFlowNode[]
): {
  readonly departedMemberIds: ReadonlySet<string>
  readonly joinedMemberIds: ReadonlySet<string>
  readonly reflowedMemberIds: ReadonlySet<string>
} {
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

    addedMemberIds.forEach((memberBlockId) => joinedMemberIds.add(memberBlockId))
    currentNode.data.group.memberBlockIds.forEach((memberBlockId) => {
      if (!nextMemberIds.has(memberBlockId)) departedMemberIds.add(memberBlockId)
    })
    node.data.group.memberBlockIds.forEach((memberBlockId) => {
      if (currentMemberIds.has(memberBlockId)) reflowedMemberIds.add(memberBlockId)
    })
  })

  return { departedMemberIds, joinedMemberIds, reflowedMemberIds }
}

function resolveExpandingMemberMotions(
  currentNodesById: ReadonlyMap<string, WorkbenchFlowNode>,
  nextNodes: readonly WorkbenchFlowNode[]
): ReadonlyMap<
  string,
  { readonly delayMs: 0; readonly origin: { readonly x: number; readonly y: number } }
> {
  const motions = new Map<
    string,
    { readonly delayMs: 0; readonly origin: { readonly x: number; readonly y: number } }
  >()

  nextNodes.forEach((node) => {
    if (node.type !== 'terminalGroup' || node.data.group.isCollapsed) return
    const currentNode = currentNodesById.get(node.id)
    if (currentNode?.type !== 'terminalGroup' || !currentNode.data.group.isCollapsed) {
      return
    }

    const origin = resolveNodeCenter(currentNode)
    node.data.group.memberBlockIds.forEach((memberBlockId) =>
      motions.set(memberBlockId, {
        delayMs: 0,
        origin
      })
    )
  })

  return motions
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

      exitingNodes.push({
        ...withObjectMotion(
          memberNode,
          createGroupMemberMotion('group-collapse', memberNode, origin, 0, createMotionId)
        ),
        draggable: false,
        selectable: false
      })
    })
  })

  return exitingNodes
}

function resolveDeletedObjectExits({
  collapsingMemberIds,
  createMotionId,
  currentNodes,
  nextNodesById
}: {
  readonly collapsingMemberIds: ReadonlySet<string>
  readonly createMotionId: ProjectWorkbenchObjectMotionInput['createMotionId']
  readonly currentNodes: readonly WorkbenchFlowNode[]
  readonly nextNodesById: ReadonlyMap<string, WorkbenchFlowNode>
}): WorkbenchFlowNode[] {
  return currentNodes.flatMap((node): WorkbenchFlowNode[] => {
    if (node.type !== 'terminal' && node.type !== 'agentConsole') return []
    if (nextNodesById.has(node.id) || collapsingMemberIds.has(node.id)) return []
    if (
      node.type === 'terminal' &&
      (node.data.isParkedInCollapsedGroup || node.data.objectMotion?.kind === 'group-collapse')
    ) {
      return []
    }
    if (node.data.objectMotion?.kind === 'delete') return [node]

    const objectMotion: WorkbenchObjectMotion = {
      ...createObjectMotion('delete', node.id, { x: 0, y: 0 }, createMotionId),
      scale: { from: 1, to: 0 }
    }

    return [
      {
        ...node,
        draggable: false,
        selectable: false,
        selected: false,
        data: {
          ...node.data,
          isContextSelected: false,
          isSelected: false,
          objectMotion
        }
      } as WorkbenchFlowNode
    ]
  })
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
  const rect = resolveNodeRect(node)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function resolveNodeRect(node: WorkbenchFlowNode): {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
} {
  const fallbackSize =
    node.type === 'terminal'
      ? node.data.block.size
      : node.type === 'terminalGroup'
        ? node.data.group.size
        : node.data.agent.layout.size
  const width = resolveNodeSize(node.style?.width, node.measured?.width ?? fallbackSize.width)
  const height = resolveNodeSize(node.style?.height, node.measured?.height ?? fallbackSize.height)

  return { height, width, x: node.position.x, y: node.position.y }
}

function isWorkflowBuildNode(node: WorkbenchFlowNode): boolean {
  return typeof node.className === 'string' && node.className.startsWith('terminal-workflow-build-')
}
