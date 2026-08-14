import type { AgentGraphChange } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'

const simultaneousTerminalSettleMs = 760
const simultaneousConnectionRevealLeadMs = 260
const simultaneousGroupRevealLeadMs = 700
const progressiveMaximumLaunchWindowMs = 8_000
const progressivePreferredStepGapMs = 780
const progressiveTerminalSettleMs = 520
const progressiveConnectionRevealLeadMs = 180
const progressiveGroupRevealLeadMs = 760
const groupRevealDurationMs = 300
const buildOriginGap = 32

interface LayoutRect {
  readonly nodeId: string
  readonly position: BlockPositionSnapshot
  readonly size: { readonly height: number; readonly width: number }
}

interface TerminalWorkflowBuildTerminalStage {
  readonly blockId: string
  readonly delayMs: number
  readonly durationMs: number
  readonly initialPosition: BlockPositionSnapshot
  readonly targetPosition: BlockPositionSnapshot
}

interface TerminalWorkflowBuildConnectionStage {
  readonly connectionId: string
  readonly revealAtMs: number
}

interface TerminalWorkflowBuildGroupStage {
  readonly revealAtMs: number
  readonly terminalGroupId: string
}

export interface TerminalWorkflowBuildChoreography {
  readonly connectionStages: readonly TerminalWorkflowBuildConnectionStage[]
  readonly groupStages: readonly TerminalWorkflowBuildGroupStage[]
  readonly operationId: string
  readonly origin: BlockPositionSnapshot
  readonly reducedMotion: boolean
  readonly terminalStages: readonly TerminalWorkflowBuildTerminalStage[]
  readonly totalDurationMs: number
}

interface CreateTerminalWorkflowBuildChoreographyInput {
  readonly canvasNodes: readonly LayoutRect[]
  readonly change: AgentGraphChange
  readonly graph: BlockGraphSnapshot
  readonly mode: TerminalWorkflowBuildMode
  readonly originNodeId?: string
  readonly reducedMotion: boolean
}

export function createTerminalWorkflowBuildChoreography({
  canvasNodes,
  change,
  graph,
  mode,
  originNodeId,
  reducedMotion
}: CreateTerminalWorkflowBuildChoreographyInput): TerminalWorkflowBuildChoreography | null {
  if (change.kind !== 'terminal_build_created') return null

  const createdBlockIds = new Set(change.blockIds)
  const blocks = change.blockIds.flatMap((blockId) => {
    const block = graph.blocks.find((candidate) => candidate.id === blockId)
    return block ? [block] : []
  })
  if (blocks.length === 0) return null

  const targetCenter = {
    x:
      blocks.reduce((sum, block) => sum + block.position.x + block.size.width / 2, 0) /
      blocks.length,
    y:
      blocks.reduce((sum, block) => sum + block.position.y + block.size.height / 2, 0) /
      blocks.length
  }
  const sourceNode =
    canvasNodes.find((node) => node.nodeId === originNodeId) ??
    resolveClosestCanvasNode(canvasNodes, targetCenter)
  const origin = sourceNode
    ? resolveTerminalWorkflowBuildOrigin({ source: sourceNode, targetCenter })
    : { x: Math.round(targetCenter.x), y: Math.round(targetCenter.y) }
  const terminalStages =
    mode === 'progressive'
      ? createProgressiveTerminalStages({ blocks, createdBlockIds, graph, origin, reducedMotion })
      : createSimultaneousTerminalStages({ blocks, origin, reducedMotion })
  const delayByBlockId = new Map(
    terminalStages.map((stage) => [stage.blockId, stage.delayMs] as const)
  )
  const connectionStages = (graph.connections ?? [])
    .filter(
      (connection) =>
        change.connectionIds.includes(connection.id) &&
        createdBlockIds.has(connection.sourceBlockId) &&
        createdBlockIds.has(connection.targetBlockId)
    )
    .map((connection) => ({
      connectionId: connection.id,
      revealAtMs: reducedMotion
        ? 0
        : Math.max(
            delayByBlockId.get(connection.sourceBlockId) ?? 0,
            delayByBlockId.get(connection.targetBlockId) ?? 0
          ) +
          (mode === 'progressive'
            ? progressiveConnectionRevealLeadMs
            : simultaneousConnectionRevealLeadMs)
    }))
  const latestTerminalDelay = Math.max(0, ...terminalStages.map((stage) => stage.delayMs))
  const groupRevealLeadMs =
    mode === 'progressive' ? progressiveGroupRevealLeadMs : simultaneousGroupRevealLeadMs
  const terminalSettleMs =
    mode === 'progressive' ? progressiveTerminalSettleMs : simultaneousTerminalSettleMs
  const groupRevealAtMs = reducedMotion ? 0 : latestTerminalDelay + groupRevealLeadMs
  const groupStages = change.terminalGroupIds.map((terminalGroupId) => ({
    revealAtMs: groupRevealAtMs,
    terminalGroupId
  }))

  return {
    connectionStages,
    groupStages,
    operationId: change.operationId,
    origin,
    reducedMotion,
    terminalStages,
    totalDurationMs: reducedMotion
      ? 0
      : latestTerminalDelay +
        Math.max(
          terminalSettleMs,
          groupStages.length > 0 ? groupRevealLeadMs + groupRevealDurationMs : 0
        )
  }
}

function createSimultaneousTerminalStages({
  blocks,
  origin,
  reducedMotion
}: {
  readonly blocks: BlockGraphSnapshot['blocks']
  readonly origin: BlockPositionSnapshot
  readonly reducedMotion: boolean
}): TerminalWorkflowBuildTerminalStage[] {
  const targetCenter = resolveBlocksCenter(blocks)
  const direction = normalizeVector({ x: targetCenter.x - origin.x, y: targetCenter.y - origin.y })
  const perpendicular = { x: -direction.y, y: direction.x }

  return blocks.map((block, index) => {
    const fanOffset = blocks.length === 1 ? 0 : ((index / (blocks.length - 1)) * 2 - 1) * 28

    return {
      blockId: block.id,
      delayMs: 0,
      durationMs: reducedMotion ? 0 : simultaneousTerminalSettleMs,
      initialPosition: reducedMotion
        ? block.position
        : {
            x: Math.round(origin.x - block.size.width / 2 + perpendicular.x * fanOffset),
            y: Math.round(origin.y - block.size.height / 2 + perpendicular.y * fanOffset)
          },
      targetPosition: block.position
    }
  })
}

function createProgressiveTerminalStages({
  blocks,
  createdBlockIds,
  graph,
  origin,
  reducedMotion
}: {
  readonly blocks: BlockGraphSnapshot['blocks']
  readonly createdBlockIds: ReadonlySet<string>
  readonly graph: BlockGraphSnapshot
  readonly origin: BlockPositionSnapshot
  readonly reducedMotion: boolean
}): TerminalWorkflowBuildTerminalStage[] {
  const orderedBlocks = resolveProgressiveBlockOrder(graph, blocks, createdBlockIds)
  const stepGapMs =
    orderedBlocks.length <= 1
      ? 0
      : Math.min(
          progressivePreferredStepGapMs,
          progressiveMaximumLaunchWindowMs / (orderedBlocks.length - 1)
        )
  const blocksById = new Map(blocks.map((block) => [block.id, block] as const))

  return orderedBlocks.map((block, index) => {
    const parentBlock = (graph.connections ?? [])
      .filter(
        (connection) =>
          connection.targetBlockId === block.id && createdBlockIds.has(connection.sourceBlockId)
      )
      .map((connection) => blocksById.get(connection.sourceBlockId))
      .find((candidate) => candidate !== undefined)

    return {
      blockId: block.id,
      delayMs: reducedMotion ? 0 : Math.round(index * stepGapMs),
      durationMs: reducedMotion ? 0 : progressiveTerminalSettleMs,
      initialPosition: reducedMotion
        ? block.position
        : parentBlock
          ? {
              x: Math.round(
                parentBlock.position.x + parentBlock.size.width / 2 - block.size.width / 2
              ),
              y: Math.round(
                parentBlock.position.y + parentBlock.size.height / 2 - block.size.height / 2
              )
            }
          : {
              x: Math.round(origin.x - block.size.width / 2),
              y: Math.round(origin.y - block.size.height / 2)
            },
      targetPosition: block.position
    }
  })
}

function resolveProgressiveBlockOrder(
  graph: BlockGraphSnapshot,
  blocks: BlockGraphSnapshot['blocks'],
  includedBlockIds: ReadonlySet<string>
): BlockGraphSnapshot['blocks'] {
  const inputOrderByBlockId = new Map(blocks.map((block, index) => [block.id, index] as const))
  const incomingCount = new Map<string, number>(blocks.map((block) => [block.id, 0]))
  const outgoingByBlockId = new Map(blocks.map((block) => [block.id, [] as string[]] as const))

  for (const connection of graph.connections ?? []) {
    if (
      !includedBlockIds.has(connection.sourceBlockId) ||
      !includedBlockIds.has(connection.targetBlockId)
    ) {
      continue
    }
    outgoingByBlockId.get(connection.sourceBlockId)?.push(connection.targetBlockId)
    incomingCount.set(
      connection.targetBlockId,
      (incomingCount.get(connection.targetBlockId) ?? 0) + 1
    )
  }

  for (const outgoing of outgoingByBlockId.values()) {
    outgoing.sort(
      (left, right) =>
        (inputOrderByBlockId.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (inputOrderByBlockId.get(right) ?? Number.MAX_SAFE_INTEGER)
    )
  }

  const queue = blocks.filter((block) => incomingCount.get(block.id) === 0)
  const orderedBlocks: BlockGraphSnapshot['blocks'][number][] = []

  for (let index = 0; index < queue.length; index += 1) {
    const block = queue[index]!
    orderedBlocks.push(block)
    for (const targetBlockId of outgoingByBlockId.get(block.id) ?? []) {
      const remaining = (incomingCount.get(targetBlockId) ?? 1) - 1
      incomingCount.set(targetBlockId, remaining)
      if (remaining === 0) {
        const targetBlock = blocks.find((candidate) => candidate.id === targetBlockId)
        if (targetBlock) queue.push(targetBlock)
      }
    }
  }

  const orderedBlockIds = new Set(orderedBlocks.map((block) => block.id))
  return [...orderedBlocks, ...blocks.filter((block) => !orderedBlockIds.has(block.id))]
}

function resolveBlocksCenter(blocks: BlockGraphSnapshot['blocks']): BlockPositionSnapshot {
  return {
    x:
      blocks.reduce((sum, block) => sum + block.position.x + block.size.width / 2, 0) /
      blocks.length,
    y:
      blocks.reduce((sum, block) => sum + block.position.y + block.size.height / 2, 0) /
      blocks.length
  }
}

export function resolveTerminalWorkflowBuildOrigin({
  source,
  targetCenter
}: {
  readonly source: Pick<LayoutRect, 'position' | 'size'>
  readonly targetCenter: BlockPositionSnapshot
}): BlockPositionSnapshot {
  const center = {
    x: source.position.x + source.size.width / 2,
    y: source.position.y + source.size.height / 2
  }
  const vector = { x: targetCenter.x - center.x, y: targetCenter.y - center.y }
  const direction = normalizeVector(vector)
  const scaleToBoundary = Math.min(
    direction.x === 0 ? Number.POSITIVE_INFINITY : source.size.width / 2 / Math.abs(direction.x),
    direction.y === 0 ? Number.POSITIVE_INFINITY : source.size.height / 2 / Math.abs(direction.y)
  )

  return {
    x: Math.round(center.x + direction.x * (scaleToBoundary + buildOriginGap)),
    y: Math.round(center.y + direction.y * (scaleToBoundary + buildOriginGap))
  }
}

function resolveClosestCanvasNode(
  nodes: readonly LayoutRect[],
  targetCenter: BlockPositionSnapshot
): LayoutRect | null {
  return (
    [...nodes].sort(
      (left, right) =>
        squaredDistanceToRegion(targetCenter, left) -
          squaredDistanceToRegion(targetCenter, right) ||
        left.position.y - right.position.y ||
        left.position.x - right.position.x ||
        left.size.height - right.size.height ||
        left.size.width - right.size.width
    )[0] ?? null
  )
}

function squaredDistanceToRegion(point: BlockPositionSnapshot, region: LayoutRect): number {
  const horizontalDistance = Math.max(
    region.position.x - point.x,
    0,
    point.x - (region.position.x + region.size.width)
  )
  const verticalDistance = Math.max(
    region.position.y - point.y,
    0,
    point.y - (region.position.y + region.size.height)
  )

  return horizontalDistance ** 2 + verticalDistance ** 2
}

function normalizeVector(vector: BlockPositionSnapshot): BlockPositionSnapshot {
  const length = Math.hypot(vector.x, vector.y)
  return length === 0 ? { x: 1, y: 0 } : { x: vector.x / length, y: vector.y / length }
}
