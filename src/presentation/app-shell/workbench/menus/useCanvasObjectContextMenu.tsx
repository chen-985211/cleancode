import type { Edge } from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode
} from 'react'

import type {
  BatchTerminalRemovalTargetSnapshot,
  BlockGraphSnapshot
} from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { CanvasObjectContextMenu } from './CanvasObjectContextMenu'
import {
  resolveCanvasObjectContextTarget,
  type CanvasObjectContextTarget,
  type CanvasTerminalObjectContextTarget
} from './canvasObjectContextTarget'
import type { AgentConsoleFlowNode } from '../../types/agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'

interface CanvasObjectContextMenuState {
  readonly graphKey: string
  readonly open: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly requestId: number
  readonly target: CanvasObjectContextTarget
}

export function useCanvasObjectContextMenu({
  edges,
  graph,
  nodes,
  onRequestSaveBlockTemplate,
  onRequestQuickExecutionBinding,
  onRequestDeleteTerminalScope
}: {
  readonly edges: readonly Edge[]
  readonly graph: BlockGraphSnapshot | null
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onRequestSaveBlockTemplate?: (blockIds: readonly string[]) => void
  readonly onRequestQuickExecutionBinding?: (target: CanvasTerminalObjectContextTarget) => void
  readonly onRequestDeleteTerminalScope?: (
    target: BatchTerminalRemovalTargetSnapshot
  ) => Promise<void> | void
}): {
  readonly close: () => void
  readonly edges: Edge[]
  readonly menu: ReactNode
  readonly nodes: WorkbenchFlowNode[]
  readonly onNodeContextMenu: (event: ReactMouseEvent<Element>, node: WorkbenchFlowNode) => void
} {
  const [state, setState] = useState<CanvasObjectContextMenuState | null>(null)
  const nextRequestIdRef = useRef(0)
  const graphKey = graph ? createGraphKey(graph) : null
  const openIntentRef = useRef({ graphKey, open: false })
  const close = useCallback(() => {
    openIntentRef.current = { ...openIntentRef.current, open: false }
    setState((current) => (current ? { ...current, open: false } : null))
  }, [])
  const menuState = state?.graphKey === graphKey ? state : null
  const activeTarget = menuState?.open ? menuState.target : null
  const activeAgentNode = resolveActiveAgentNode(nodes, menuState?.target ?? null)

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

      const nextGraphKey = createGraphKey(graph)
      if (openIntentRef.current.graphKey === nextGraphKey && openIntentRef.current.open) {
        event.preventDefault()
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
      openIntentRef.current = { graphKey: nextGraphKey, open: true }
      setState({
        graphKey: nextGraphKey,
        open: true,
        position: { x: event.clientX, y: event.clientY },
        requestId: (nextRequestIdRef.current += 1),
        target
      })
    },
    [close, graph]
  )

  return {
    close,
    edges: useMemo(
      () => projectContextSelectionOntoEdges(edges, activeTarget),
      [activeTarget, edges]
    ),
    menu: menuState ? (
      <CanvasObjectContextMenu
        agentActions={
          activeAgentNode
            ? {
                agent: activeAgentNode.data.agent,
                onRemove: activeAgentNode.data.onRemove,
                onRename: activeAgentNode.data.onRename
              }
            : undefined
        }
        open={menuState.open}
        position={menuState.position}
        requestId={menuState.requestId}
        target={menuState.target}
        onClose={close}
        onAddToQuickExecution={onRequestQuickExecutionBinding}
        onFavorite={
          menuState.target.kind === 'agent'
            ? undefined
            : (blockIds) => onRequestSaveBlockTemplate?.(blockIds)
        }
        onRemove={
          onRequestDeleteTerminalScope
            ? (target) => {
                const removalTarget = toBatchTerminalRemovalTarget(target)
                if (removalTarget) void onRequestDeleteTerminalScope(removalTarget)
              }
            : undefined
        }
      />
    ) : null,
    nodes: useMemo(
      () => projectContextSelectionOntoNodes(nodes, activeTarget),
      [activeTarget, nodes]
    ),
    onNodeContextMenu
  }
}

function toBatchTerminalRemovalTarget(
  target: CanvasObjectContextTarget
): BatchTerminalRemovalTargetSnapshot | null {
  if (target.kind === 'agent' || target.kind === 'terminal') return null
  if (target.kind === 'workflow') {
    return { type: 'workflow', terminalBlockIds: [...target.terminalBlockIds] }
  }
  return {
    type: 'combination',
    terminalGroupId: target.groupId,
    terminalBlockIds: [...target.terminalBlockIds]
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
    return {
      ...node,
      data: {
        ...node.data,
        isContextSelected: selectedNodeIds.has(node.id)
      }
    } as WorkbenchFlowNode
  })
}

function resolveActiveAgentNode(
  nodes: readonly WorkbenchFlowNode[],
  target: CanvasObjectContextTarget | null
): AgentConsoleFlowNode | null {
  if (target?.kind !== 'agent') return null

  return (
    nodes.find(
      (node): node is AgentConsoleFlowNode =>
        node.type === 'agentConsole' && node.data.agent.agentId === target.agentId
    ) ?? null
  )
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
