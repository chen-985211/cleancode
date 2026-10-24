import type { Edge } from '@xyflow/react'
import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { canvasArrangementItemKey } from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementSelection'
import { analyzeCanvasExecutionSelection } from '../../../shared-kernel/domain/policies/CanvasExecutionSemantics'
import { readAgentIdFromFlowNodeId } from '../projections/agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

interface CanvasLayer {
  readonly key: string
  readonly shellId?: string
  readonly units: Map<string, readonly string[]>
}

// A layer is a complete workflow, standalone node, or combination. Its shell,
// dependency edges and nodes occupy consecutive ranks in the same CSS context.
export function projectWorkbenchCanvasLayers({
  nodes,
  edges,
  graph,
  arrangement,
  draggedNodeIds = [],
  nodeOrder = [],
  promotions = []
}: {
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly edges: readonly Edge[]
  readonly graph: BlockGraphSnapshot | null
  readonly arrangement?: CanvasArrangementSnapshot
  readonly draggedNodeIds?: readonly string[]
  readonly nodeOrder?: readonly string[]
  readonly promotions?: readonly (readonly string[])[]
}): { nodes: WorkbenchFlowNode[]; edges: Edge[]; nodeOrder: string[] } {
  const layers = createCanvasLayers(nodes, edges, graph)
  const stackedKeys = new Set<string>()
  const stacks: CanvasLayer[][] = []
  for (const stack of arrangement?.stacks ?? []) {
    const members: CanvasLayer[] = []
    for (const item of stack.items) {
      const key = canvasArrangementItemKey(item)
      const layer = layers.get(key)
      if (layer && !stackedKeys.has(key)) {
        stackedKeys.add(key)
        members.push(layer)
      }
    }
    if (members.length) stacks.push(members)
  }
  const orderById = new Map(nodeOrder.map((id, index) => [id, index]))
  const priority = (ids: readonly string[]) => {
    const known = ids.flatMap((id) => (orderById.has(id) ? [orderById.get(id)!] : []))
    return known.length ? Math.max(...known) : Infinity
  }
  const layerIds = (layer: CanvasLayer) => [
    ...(layer.shellId ? [layer.shellId] : []),
    ...[...layer.units.values()].flat()
  ]
  let ordered = [
    ...[...layers.values()].filter((layer) => !stackedKeys.has(layer.key)).map((layer) => [layer]),
    ...stacks
  ].sort((a, b) => priority(a.flatMap(layerIds)) - priority(b.flatMap(layerIds)))
  const unitsByLayer = new Map(
    [...layers.values()].map((layer) => [
      layer.key,
      [...layer.units.values()].sort((a, b) => priority(a) - priority(b))
    ])
  )
  // Apply releases in gesture order, regardless of save completion order.
  // Stack members are one outer unit; their persisted internal order wins.
  for (const ids of [...promotions, draggedNodeIds]) {
    const dragged = new Set(ids)
    const isDraggedUnit = (members: readonly string[]) => members.some((id) => dragged.has(id))
    ordered = raiseLast(ordered, (group) => group.some((layer) => isDraggedUnit(layerIds(layer))))
    for (const layer of layers.values()) {
      if (layer.shellId && dragged.has(layer.shellId)) continue
      unitsByLayer.set(layer.key, raiseLast(unitsByLayer.get(layer.key)!, isDraggedUnit))
    }
  }
  const nodeRanks = new Map<string, number>()
  const edgeRanks = new Map<string, number>()
  const nextOrder: string[] = []
  let rank = 1
  for (const layer of ordered.flat()) {
    if (layer.shellId) {
      nodeRanks.set(layer.shellId, rank++)
      nextOrder.push(layer.shellId)
    }
    for (const ids of unitsByLayer.get(layer.key)!) {
      nextOrder.push(...ids)
      const edgeRank = rank++
      const nodeRank = rank++
      for (const id of ids) {
        edgeRanks.set(id, edgeRank)
        nodeRanks.set(id, nodeRank)
      }
    }
  }
  return {
    nodeOrder: nextOrder,
    nodes: nodes.map((node) => {
      const zIndex = nodeRanks.get(node.id) ?? 0
      return node.zIndex === zIndex ? node : { ...node, zIndex }
    }),
    edges: edges.map((edge) => {
      const sourceRank = edgeRanks.get(edge.source)
      const targetRank = edgeRanks.get(edge.target)
      // Approval links do not merge execution units. Keep cross-object links
      // behind both endpoints, including when either endpoint is being dragged.
      const zIndex =
        sourceRank !== undefined && sourceRank === targetRank
          ? sourceRank
          : Math.min(nodeRanks.get(edge.source) ?? 1, nodeRanks.get(edge.target) ?? 1) - 1
      return edge.zIndex === zIndex ? edge : { ...edge, zIndex }
    })
  }
}

function createCanvasLayers(
  nodes: readonly WorkbenchFlowNode[],
  edges: readonly Edge[],
  graph: BlockGraphSnapshot | null
): Map<string, CanvasLayer> {
  const terminalIds = [
    ...new Set([
      ...(graph?.blocks.map((block) => block.id) ?? []),
      ...nodes.filter((node) => node.type === 'terminal').map((node) => node.id)
    ])
  ]
  const analysis = analyzeCanvasExecutionSelection({
    terminals: terminalIds.map((terminalId) => ({ terminalId })),
    dependencies: graph
      ? (graph.connections ?? []).map((edge) => ({
          sourceTerminalId: edge.sourceBlockId,
          targetTerminalId: edge.targetBlockId
        }))
      : edges
          .filter((edge) => edge.type === 'terminalDependency')
          .map((edge) => ({
            sourceTerminalId: edge.source,
            targetTerminalId: edge.target
          })),
    selectedTerminalIds: terminalIds
  })
  const unitByTerminalId = new Map(
    analysis.topLevelExecutionUnits.flatMap((unit) =>
      unit.terminalIds.map((id) => [id, unit.terminalIds] as const)
    )
  )
  const groups = nodes.filter((node) => node.type === 'terminalGroup')
  const groupByTerminalId = new Map(
    groups.flatMap((node) =>
      (
        graph?.terminalGroups.find((group) => group.id === node.id) ?? node.data.group
      ).memberBlockIds.map((id) => [id, node.id] as const)
    )
  )
  const layers = new Map<string, CanvasLayer>()
  for (const node of nodes) {
    const ids = node.type === 'terminal' ? (unitByTerminalId.get(node.id) ?? [node.id]) : [node.id]
    const unitKey =
      node.type === 'agentConsole'
        ? canvasArrangementItemKey({
            kind: 'agent',
            agentId: readAgentIdFromFlowNodeId(node.id) ?? node.id
          })
        : ids.length > 1
          ? canvasArrangementItemKey({ kind: 'workflow', terminalIds: ids })
          : canvasArrangementItemKey({ kind: 'terminal', terminalId: node.id })
    const shellId = node.type === 'terminalGroup' ? node.id : groupByTerminalId.get(node.id)
    const key = shellId
      ? canvasArrangementItemKey({ kind: 'combination', terminalGroupId: shellId })
      : unitKey
    let layer = layers.get(key)
    if (!layer) {
      layer = { key, shellId, units: new Map() }
      layers.set(key, layer)
    }
    if (node.type !== 'terminalGroup') layer.units.set(unitKey, ids)
  }
  // Keep hidden members in the order so collapsing a combination does not
  // discard its internal layering when another object is moved.
  for (const group of groups) {
    const layer = layers.get(
      canvasArrangementItemKey({ kind: 'combination', terminalGroupId: group.id })
    )!
    const memberIds =
      graph?.terminalGroups.find((entry) => entry.id === group.id)?.memberBlockIds ??
      group.data.group.memberBlockIds
    for (const id of memberIds) {
      const ids = unitByTerminalId.get(id) ?? [id]
      const key = canvasArrangementItemKey(
        ids.length > 1
          ? { kind: 'workflow', terminalIds: ids }
          : { kind: 'terminal', terminalId: id }
      )
      if (!layer.units.has(key)) layer.units.set(key, ids)
    }
  }
  return layers
}

function raiseLast<T>(items: readonly T[], isRaised: (item: T) => boolean): T[] {
  return [...items.filter((item) => !isRaised(item)), ...items.filter(isRaised)]
}
