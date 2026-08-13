import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot
} from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { analyzeCanvasExecutionSelection } from '../../shared-kernel/domain/policies/CanvasExecutionSemantics'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchFlowNode } from './types'
import { resolveWorkbenchNodeSize } from './workbenchNodeFocusViewport'
import type { ShortcutPlatform } from './applicationShortcuts'

export interface CanvasArrangementSelectionRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface CanvasArrangementSelectionItem {
  readonly key: string
  readonly nodeIds: readonly string[]
  readonly position: { readonly x: number; readonly y: number }
  readonly reference: CanvasArrangementItemReference
  readonly size: { readonly width: number; readonly height: number }
}

export interface CanvasArrangementSelection {
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly rect: CanvasArrangementSelectionRect | null
}

export function isCanvasArrangementSelectionModifier(
  modifier: { readonly ctrlKey: boolean; readonly metaKey: boolean },
  platform: ShortcutPlatform
): boolean {
  return platform === 'mac' ? modifier.metaKey : modifier.ctrlKey
}

export function normalizeCanvasArrangementSelectionRect(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number }
): CanvasArrangementSelectionRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  }
}

export function resolveCanvasArrangementSelectionItems({
  arrangement,
  graph,
  nodes,
  selection
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly graph: BlockGraphSnapshot
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly selection: CanvasArrangementSelectionRect
}): CanvasArrangementSelectionItem[] {
  return resolveCanvasArrangementSelectionFromCandidates({
    arrangement,
    candidates: listCanvasArrangementItems(graph, nodes),
    selection
  })
}

export function resolveCanvasArrangementSelectionFromCandidates({
  arrangement,
  candidates,
  selection
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly candidates: readonly CanvasArrangementSelectionItem[]
  readonly selection: CanvasArrangementSelectionRect
}): CanvasArrangementSelectionItem[] {
  const normalizedSelection = normalizeRect(selection)
  const selectedKeys = new Set(
    candidates
      .filter((candidate) => intersectsRect(normalizedSelection, toRect(candidate)))
      .map((candidate) => candidate.key)
  )

  for (const stack of arrangement.stacks) {
    const stackKeys = stack.items.map(canvasArrangementItemKey)
    if (stackKeys.some((key) => selectedKeys.has(key))) {
      for (const key of stackKeys) selectedKeys.add(key)
    }
  }

  return candidates.filter((candidate) => selectedKeys.has(candidate.key))
}

export function projectCanvasArrangementSelectionOntoNodes(
  nodes: WorkbenchFlowNode[],
  items: readonly CanvasArrangementSelectionItem[],
  arrangement?: CanvasArrangementSnapshot
): WorkbenchFlowNode[] {
  if (items.length === 0) return nodes

  const selectedStack = arrangement ? findCanvasArrangementStack(arrangement, items) : null
  const visibleSelectionItems = selectedStack
    ? items.filter(
        (item) =>
          item.key ===
          canvasArrangementItemKey(selectedStack.items[selectedStack.items.length - 1]!)
      )
    : items
  const selectedNodeIds = new Set(visibleSelectionItems.flatMap((item) => item.nodeIds))
  return nodes.map((node) =>
    selectedNodeIds.has(node.id)
      ? {
          ...node,
          className: [node.className, 'canvas-arrangement-node--selected'].filter(Boolean).join(' ')
        }
      : node
  )
}

export function listCanvasArrangementItems(
  graph: BlockGraphSnapshot,
  nodes: readonly WorkbenchFlowNode[]
): CanvasArrangementSelectionItem[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const groupedTerminalIds = new Set(
    graph.terminalGroups.flatMap((group) => [...group.memberBlockIds])
  )
  const rootTerminalIds = graph.blocks
    .map((block) => block.id)
    .filter((blockId) => !groupedTerminalIds.has(blockId))
  const rootTerminalIdSet = new Set(rootTerminalIds)
  const unitsByKey = new Map<string, readonly string[]>()

  for (const terminalId of rootTerminalIds) {
    const analysis = analyzeCanvasExecutionSelection({
      terminals: rootTerminalIds.map((id) => ({ terminalId: id })),
      dependencies: (graph.connections ?? [])
        .filter(
          (connection) =>
            rootTerminalIdSet.has(connection.sourceBlockId) &&
            rootTerminalIdSet.has(connection.targetBlockId)
        )
        .map((connection) => ({
          sourceTerminalId: connection.sourceBlockId,
          targetTerminalId: connection.targetBlockId
        })),
      selectedTerminalIds: [terminalId]
    })
    if (analysis.classification !== 'terminal' && analysis.classification !== 'workflow') continue
    const terminalIds = analysis.expandedTerminalIds
    const reference: CanvasArrangementItemReference =
      analysis.classification === 'terminal'
        ? { kind: 'terminal', terminalId: terminalIds[0]! }
        : { kind: 'workflow', terminalIds }
    unitsByKey.set(canvasArrangementItemKey(reference), terminalIds)
  }

  const items: CanvasArrangementSelectionItem[] = []
  for (const terminalIds of unitsByKey.values()) {
    const reference: CanvasArrangementItemReference =
      terminalIds.length === 1
        ? { kind: 'terminal', terminalId: terminalIds[0]! }
        : { kind: 'workflow', terminalIds }
    const item = createItem(reference, terminalIds, nodesById)
    if (item) items.push(item)
  }

  for (const group of graph.terminalGroups) {
    const reference = { kind: 'combination', terminalGroupId: group.id } as const
    const item = createItem(reference, [group.id], nodesById)
    if (item) items.push(item)
  }

  for (const node of nodes) {
    if (node.type !== 'agentConsole') continue
    const agentId = readAgentIdFromFlowNodeId(node.id)
    if (!agentId) continue
    const reference = { kind: 'agent', agentId } as const
    const item = createItem(reference, [node.id], nodesById)
    if (item) items.push(item)
  }

  return items.sort(
    (left, right) =>
      left.position.y - right.position.y ||
      left.position.x - right.position.x ||
      left.key.localeCompare(right.key)
  )
}

export function canvasArrangementItemKey(item: CanvasArrangementItemReference): string {
  switch (item.kind) {
    case 'terminal':
      return `terminal:${item.terminalId}`
    case 'workflow':
      return `workflow:${[...item.terminalIds].sort().join(',')}`
    case 'combination':
      return `combination:${item.terminalGroupId}`
    case 'agent':
      return `agent:${item.agentId}`
  }
}

export function findCanvasArrangementStack(
  arrangement: CanvasArrangementSnapshot,
  items: readonly CanvasArrangementSelectionItem[]
) {
  const selectedKeys = new Set(items.map((item) => item.key))

  return (
    arrangement.stacks.find((stack) => {
      const stackKeys = stack.items.map(canvasArrangementItemKey)
      return (
        stackKeys.length === selectedKeys.size && stackKeys.every((key) => selectedKeys.has(key))
      )
    }) ?? null
  )
}

export function findCanvasArrangementStacks(
  arrangement: CanvasArrangementSnapshot,
  items: readonly CanvasArrangementSelectionItem[]
) {
  const selectedKeys = new Set(items.map((item) => item.key))
  return arrangement.stacks.filter((stack) =>
    stack.items.some((item) => selectedKeys.has(canvasArrangementItemKey(item)))
  )
}

function createItem(
  reference: CanvasArrangementItemReference,
  nodeIds: readonly string[],
  nodesById: ReadonlyMap<string, WorkbenchFlowNode>
): CanvasArrangementSelectionItem | null {
  const itemNodes = nodeIds
    .map((nodeId) => nodesById.get(nodeId))
    .filter((node): node is WorkbenchFlowNode => Boolean(node))
  if (itemNodes.length !== nodeIds.length || itemNodes.length === 0) return null

  const left = Math.min(...itemNodes.map((node) => node.position.x))
  const top = Math.min(...itemNodes.map((node) => node.position.y))
  const right = Math.max(
    ...itemNodes.map((node) => node.position.x + resolveWorkbenchNodeSize(node).width)
  )
  const bottom = Math.max(
    ...itemNodes.map((node) => node.position.y + resolveWorkbenchNodeSize(node).height)
  )

  return {
    key: canvasArrangementItemKey(reference),
    nodeIds: [...nodeIds],
    position: { x: left, y: top },
    reference,
    size: { width: right - left, height: bottom - top }
  }
}

function normalizeRect(rect: CanvasArrangementSelectionRect): CanvasArrangementSelectionRect {
  return {
    x: Math.min(rect.x, rect.x + rect.width),
    y: Math.min(rect.y, rect.y + rect.height),
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  }
}

function toRect(item: CanvasArrangementSelectionItem): CanvasArrangementSelectionRect {
  return { ...item.position, ...item.size }
}

function intersectsRect(
  left: CanvasArrangementSelectionRect,
  right: CanvasArrangementSelectionRect
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}
