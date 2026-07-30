import type { Edge } from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'

import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { CanvasObjectContextMenu } from './CanvasObjectContextMenu'
import {
  resolveCanvasObjectContextTarget,
  type CanvasObjectContextTarget
} from './canvasObjectContextTarget'
import type { WorkbenchFlowNode } from './types'

interface CanvasObjectContextMenuState {
  readonly graphKey: string
  readonly position: { readonly x: number; readonly y: number }
  readonly target: CanvasObjectContextTarget
}

export function useCanvasObjectContextMenu({
  edges,
  graph,
  nodes,
  onRequestSaveBlockTemplate
}: {
  readonly edges: readonly Edge[]
  readonly graph: BlockGraphSnapshot | null
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
}): {
  readonly close: () => void
  readonly edges: Edge[]
  readonly menu: ReactNode
  readonly nodes: WorkbenchFlowNode[]
  readonly onNodeContextMenu: (event: ReactMouseEvent<Element>, node: WorkbenchFlowNode) => void
} {
  const [state, setState] = useState<CanvasObjectContextMenuState | null>(null)
  const close = useCallback(() => setState(null), [])
  const graphKey = graph ? createGraphKey(graph) : null
  const activeState = state?.graphKey === graphKey ? state : null

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setState((current) => (current?.graphKey === graphKey ? current : null)),
      0
    )
    return () => window.clearTimeout(timeoutId)
  }, [graphKey])

  const onNodeContextMenu = useCallback(
    (event: ReactMouseEvent<Element>, node: WorkbenchFlowNode): void => {
      if (!graph || !isSupportedNodeContextHit(event, node)) {
        close()
        return
      }
      const target = resolveCanvasObjectContextTarget(graph, {
        nodeId: node.id,
        nodeType: node.type
      })
      if (!target) {
        close()
        return
      }

      event.preventDefault()
      setState({
        graphKey: createGraphKey(graph),
        position: { x: event.clientX, y: event.clientY },
        target
      })
    },
    [close, graph]
  )

  return {
    close,
    edges: useMemo(
      () => projectContextSelectionOntoEdges(edges, activeState?.target ?? null),
      [activeState?.target, edges]
    ),
    menu: activeState ? (
      <CanvasObjectContextMenu
        position={activeState.position}
        target={activeState.target}
        onClose={close}
        onFavorite={(blockIds) => onRequestSaveBlockTemplate?.(blockIds)}
      />
    ) : null,
    nodes: useMemo(
      () => projectContextSelectionOntoNodes(nodes, activeState?.target ?? null),
      [activeState?.target, nodes]
    ),
    onNodeContextMenu
  }
}

function createGraphKey(graph: BlockGraphSnapshot): string {
  return `${graph.projectId}\0${graph.workspaceId}\0${graph.id}`
}

function isSupportedNodeContextHit(
  event: ReactMouseEvent<Element>,
  node: WorkbenchFlowNode
): boolean {
  if (node.type !== 'terminalGroup' || !(event.target instanceof Element)) return true

  return (
    event.target.matches('.terminal-group-node') ||
    Boolean(event.target.closest('.terminal-group-node__header'))
  )
}

function projectContextSelectionOntoNodes(
  nodes: readonly WorkbenchFlowNode[],
  target: CanvasObjectContextTarget | null
): WorkbenchFlowNode[] {
  if (!target) return [...nodes]
  const selectedNodeIds = new Set(target.selectedNodeIds)

  return nodes.map((node) => {
    if (node.type === 'agentConsole') return node

    return {
      ...node,
      data: {
        ...node.data,
        isContextSelected: selectedNodeIds.has(node.id)
      }
    } as WorkbenchFlowNode
  })
}

function projectContextSelectionOntoEdges(
  edges: readonly Edge[],
  target: CanvasObjectContextTarget | null
): Edge[] {
  if (!target || target.kind !== 'workflow') return [...edges]
  const selectedConnectionIds = new Set(target.selectedConnectionIds)

  return edges.map((edge) =>
    selectedConnectionIds.has(edge.id)
      ? {
          ...edge,
          className: [edge.className, 'terminal-workflow-edge--context-selected']
            .filter(Boolean)
            .join(' ')
        }
      : edge
  )
}
