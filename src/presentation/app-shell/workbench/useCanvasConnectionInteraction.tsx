import type { Edge, EdgeChange } from '@xyflow/react'
import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'

import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { isTerminalConnectionEditableInCanvasScope } from '../../../contexts/block-graph/presentation/view-models/terminalConnectionScope'
import { CanvasObjectContextMenu } from './menus/CanvasObjectContextMenu'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

interface ConnectionInteractionState {
  readonly scopeKey: string
  readonly selectedIds: readonly string[]
  readonly context: {
    readonly edgeId: string
    readonly open: boolean
    readonly position: { readonly x: number; readonly y: number }
    readonly requestId: number
  } | null
}

export function useCanvasConnectionInteraction({
  edges,
  graph,
  editingTerminalGroupId,
  isBlocked,
  onBeforeOpen,
  onDeleteEdges,
  onNodeClick
}: {
  readonly edges: readonly Edge[]
  readonly graph: BlockGraphSnapshot | null
  readonly editingTerminalGroupId: string | null
  readonly isBlocked: boolean
  readonly onBeforeOpen: () => void
  readonly onDeleteEdges: (edges: Edge[]) => Promise<void>
  readonly onNodeClick: (event: MouseEvent, node: WorkbenchFlowNode) => void
}) {
  const scopeKey = JSON.stringify([
    graph?.projectId,
    graph?.workspaceId,
    graph?.id,
    editingTerminalGroupId,
    isBlocked
  ])
  const [state, setState] = useState<ConnectionInteractionState>({
    scopeKey,
    selectedIds: [],
    context: null
  })
  if (state.scopeKey !== scopeKey) {
    setState({ scopeKey, selectedIds: [], context: null })
  }
  const current = state.scopeKey === scopeKey ? state : { selectedIds: [], context: null }
  const inFlight = useRef(new Set<string>())
  const nextRequestId = useRef(0)
  const connectionById = new Map(
    graph?.connections?.map((connection) => [connection.id, connection])
  )
  const isEditable = (edge: Edge): boolean => {
    const connection = connectionById.get(edge.id)
    return Boolean(
      !isBlocked &&
      connection &&
      edge.deletable !== false &&
      !edge.id.startsWith('approval:') &&
      isTerminalConnectionEditableInCanvasScope(
        graph,
        connection.sourceBlockId,
        connection.targetBlockId,
        editingTerminalGroupId
      )
    )
  }
  const selectedIds = new Set(current.selectedIds)
  const context =
    current.context && edges.some((edge) => edge.id === current.context?.edgeId && isEditable(edge))
      ? current.context
      : null
  const close = useCallback(() => {
    setState((previous) =>
      previous.context ? { ...previous, context: { ...previous.context, open: false } } : previous
    )
  }, [])
  const deleteEdges = async (candidates: Edge[]): Promise<void> => {
    const accepted = candidates.filter(
      (edge) => isEditable(edge) && !inFlight.current.has(`${scopeKey}\0${edge.id}`)
    )
    if (accepted.length === 0) return
    const keys = accepted.map((edge) => `${scopeKey}\0${edge.id}`)
    for (const key of keys) inFlight.current.add(key)
    try {
      await onDeleteEdges(accepted)
    } finally {
      for (const key of keys) inFlight.current.delete(key)
    }
  }
  const clearSelection = () => setState({ scopeKey, selectedIds: [], context: null })

  return {
    flowProps: {
      onNodeClick: (event: MouseEvent, node: WorkbenchFlowNode) => {
        clearSelection()
        onNodeClick(event, node)
      },
      deleteKeyCode: null,
      onEdgesDelete: (deletedEdges: Edge[]) => void deleteEdges(deletedEdges),
      edges: edges.map((edge) => ({
        ...edge,
        selected:
          isEditable(edge) &&
          (selectedIds.has(edge.id) || (context?.open === true && context.edgeId === edge.id))
      })),
      onEdgesChange: (changes: EdgeChange[]): void => {
        const next = new Set(current.selectedIds)
        for (const change of changes) {
          if (change.type !== 'select') continue
          const edge = edges.find((candidate) => candidate.id === change.id)
          if (change.selected && edge && isEditable(edge)) next.add(change.id)
          else next.delete(change.id)
        }
        setState((previous) => ({ ...previous, scopeKey, selectedIds: [...next] }))
      },
      onEdgeClick: (event: MouseEvent<Element>): void => {
        event.currentTarget.closest<HTMLElement>('.canvas-surface')?.focus({ preventScroll: true })
      },
      onEdgeContextMenu: (event: MouseEvent<Element>, edge: Edge): void => {
        event.preventDefault()
        event.stopPropagation()
        if (!isEditable(edge)) return
        onBeforeOpen()
        setState((previous) => ({
          ...previous,
          scopeKey,
          context: {
            edgeId: edge.id,
            open: true,
            position: { x: event.clientX, y: event.clientY },
            requestId: ++nextRequestId.current
          }
        }))
      }
    },
    clearSelection,
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        !['Backspace', 'Delete'].includes(event.key)
      )
        return
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="menu"], .xterm'
        )
      )
        return
      const selected = edges.filter((edge) => selectedIds.has(edge.id) && isEditable(edge))
      if (selected.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      void deleteEdges(selected)
    },
    menu: context ? (
      <CanvasObjectContextMenu
        open={context.open}
        position={context.position}
        requestId={context.requestId}
        target={{ kind: 'connection', connectionId: context.edgeId }}
        onClose={close}
        onDisconnect={(id) => {
          const edge = edges.find((candidate) => candidate.id === id)
          if (edge) void deleteEdges([edge])
        }}
      />
    ) : null
  }
}
