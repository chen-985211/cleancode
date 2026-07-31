import type { AgentGraphChange } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type {
  BlockGraphSnapshot,
  BlockPositionSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'

const maximumLaunchWindowMs = 1_400
const preferredLayerGapMs = 280
const terminalSettleMs = 760
const connectionRevealLeadMs = 260
const groupRevealLeadMs = 700
const groupRevealDurationMs = 300
const buildOriginGap = 32

interface LayoutRect {
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
  readonly agentNode: LayoutRect | null
  readonly change: AgentGraphChange
  readonly graph: BlockGraphSnapshot
  readonly reducedMotion: boolean
}

export function createTerminalWorkflowBuildChoreography({
  agentNode,
  change,
  graph,
  reducedMotion
}: CreateTerminalWorkflowBuildChoreographyInput): TerminalWorkflowBuildChoreography | null {
  if (change.kind !== 'terminal_workflow_created') return null

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
  const origin = agentNode
    ? resolveTerminalWorkflowBuildOrigin({ agent: agentNode, targetCenter })
    : { x: Math.round(targetCenter.x), y: Math.round(targetCenter.y) }
  const layerByBlockId = resolveDependencyLayers(graph, change.blockIds, createdBlockIds)
  const maximumLayer = Math.max(0, ...layerByBlockId.values())
  const layerGapMs =
    maximumLayer === 0 ? 0 : Math.min(preferredLayerGapMs, maximumLaunchWindowMs / maximumLayer)
  const direction = normalizeVector({ x: targetCenter.x - origin.x, y: targetCenter.y - origin.y })
  const perpendicular = { x: -direction.y, y: direction.x }

  const terminalStages = blocks.map((block, index) => {
    const fanOffset = blocks.length === 1 ? 0 : ((index / (blocks.length - 1)) * 2 - 1) * 28
    return {
      blockId: block.id,
      delayMs: reducedMotion ? 0 : Math.round((layerByBlockId.get(block.id) ?? 0) * layerGapMs),
      durationMs: reducedMotion ? 0 : terminalSettleMs,
      initialPosition: reducedMotion
        ? block.position
        : {
            x: Math.round(origin.x - block.size.width / 2 + perpendicular.x * fanOffset),
            y: Math.round(origin.y - block.size.height / 2 + perpendicular.y * fanOffset)
          },
      targetPosition: block.position
    }
  })
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
          ) + connectionRevealLeadMs
    }))
  const latestTerminalDelay = Math.max(0, ...terminalStages.map((stage) => stage.delayMs))
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

export function resolveTerminalWorkflowBuildOrigin({
  agent,
  targetCenter
}: {
  readonly agent: LayoutRect
  readonly targetCenter: BlockPositionSnapshot
}): BlockPositionSnapshot {
  const center = {
    x: agent.position.x + agent.size.width / 2,
    y: agent.position.y + agent.size.height / 2
  }
  const vector = { x: targetCenter.x - center.x, y: targetCenter.y - center.y }
  const direction = normalizeVector(vector)
  const scaleToBoundary = Math.min(
    direction.x === 0 ? Number.POSITIVE_INFINITY : agent.size.width / 2 / Math.abs(direction.x),
    direction.y === 0 ? Number.POSITIVE_INFINITY : agent.size.height / 2 / Math.abs(direction.y)
  )

  return {
    x: Math.round(center.x + direction.x * (scaleToBoundary + buildOriginGap)),
    y: Math.round(center.y + direction.y * (scaleToBoundary + buildOriginGap))
  }
}

function resolveDependencyLayers(
  graph: BlockGraphSnapshot,
  orderedBlockIds: readonly string[],
  includedBlockIds: ReadonlySet<string>
): ReadonlyMap<string, number> {
  const layerByBlockId = new Map(orderedBlockIds.map((blockId) => [blockId, 0]))
  const incomingCount = new Map(orderedBlockIds.map((blockId) => [blockId, 0]))
  const outgoingByBlockId = new Map(orderedBlockIds.map((blockId) => [blockId, [] as string[]]))

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

  const queue = orderedBlockIds.filter((blockId) => incomingCount.get(blockId) === 0)
  for (let index = 0; index < queue.length; index += 1) {
    const sourceBlockId = queue[index]!
    for (const targetBlockId of outgoingByBlockId.get(sourceBlockId) ?? []) {
      layerByBlockId.set(
        targetBlockId,
        Math.max(
          layerByBlockId.get(targetBlockId) ?? 0,
          (layerByBlockId.get(sourceBlockId) ?? 0) + 1
        )
      )
      const remaining = (incomingCount.get(targetBlockId) ?? 1) - 1
      incomingCount.set(targetBlockId, remaining)
      if (remaining === 0) queue.push(targetBlockId)
    }
  }

  return layerByBlockId
}

function normalizeVector(vector: BlockPositionSnapshot): BlockPositionSnapshot {
  const length = Math.hypot(vector.x, vector.y)
  return length === 0 ? { x: 1, y: 0 } : { x: vector.x / length, y: vector.y / length }
}
