import type { Edge, ReactFlowInstance } from '@xyflow/react'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from 'react'

import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { ShortcutPlatform } from './applicationShortcuts'
import {
  isCanvasArrangementSelectionModifier,
  listCanvasArrangementItems,
  normalizeCanvasArrangementSelectionRect,
  resolveCanvasArrangementSelectionFromCandidates,
  type CanvasArrangementSelection,
  type CanvasArrangementSelectionItem
} from './canvasArrangementSelection'
import { resolveBlockTemplatePlacement } from './blockTemplatePlacement'
import type { WorkbenchFlowNode } from './types'
import { createWorkbenchNodeOccupancy } from './workbenchNodeOccupancy'

export function useBlockTemplateCanvasInteraction({
  arrangement,
  graph,
  nodes,
  onCancelPlacement,
  onPlace,
  placementTemplate,
  reactFlowInstanceRef,
  shortcutPlatform
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly graph: BlockGraphSnapshot | null
  readonly nodes: readonly WorkbenchFlowNode[]
  readonly onCancelPlacement?: () => void
  readonly onPlace?: (origin: { readonly x: number; readonly y: number }) => Promise<void> | void
  readonly placementTemplate?: BlockTemplateSnapshot
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly shortcutPlatform: ShortcutPlatform
}) {
  const selectionDragRef = useRef<{
    readonly pointerId: number
    readonly candidates: readonly CanvasArrangementSelectionItem[]
    readonly startClient: { readonly x: number; readonly y: number }
    readonly startLocal: { readonly x: number; readonly y: number }
  } | null>(null)
  const [canvasSelection, setCanvasSelection] = useState<CanvasArrangementSelection | null>(null)
  const [placementOrigin, setPlacementOrigin] = useState<{
    readonly x: number
    readonly y: number
  } | null>(null)

  useEffect(() => {
    setCanvasSelection(null)
    setPlacementOrigin(null)
  }, [graph?.id])

  useEffect(() => {
    if (!placementTemplate) setPlacementOrigin(null)
  }, [placementTemplate])

  useEffect(() => {
    if (!placementTemplate || !onCancelPlacement) return undefined
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancelPlacement()
    }
    document.addEventListener('keydown', cancelOnEscape)
    return () => document.removeEventListener('keydown', cancelOnEscape)
  }, [onCancelPlacement, placementTemplate])

  function beginSelection(event: ReactPointerEvent<HTMLDivElement>): void {
    if (
      placementTemplate ||
      event.button !== 0 ||
      !graph ||
      !isCanvasArrangementSelectionModifier(event, shortcutPlatform) ||
      !(event.target as Element).closest('.react-flow__pane')
    ) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    selectionDragRef.current = {
      pointerId: event.pointerId,
      candidates: listCanvasArrangementItems(graph, nodes),
      startClient: { x: event.clientX, y: event.clientY },
      startLocal: { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }
    setCanvasSelection(null)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  function continueInteraction(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = selectionDragRef.current
    if (drag?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect()
      const rect = normalizeCanvasArrangementSelectionRect(drag.startLocal, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      })
      setCanvasSelection({
        items: resolveSelectionItems(drag.startClient, { x: event.clientX, y: event.clientY }),
        rect
      })
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (
      placementTemplate &&
      !(event.target as Element).closest('[data-workbench-canvas-obstruction]')
    ) {
      setPlacementOrigin(resolvePlacementOrigin({ x: event.clientX, y: event.clientY }))
    }
  }

  function completeSelection(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = selectionDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    selectionDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const instance = reactFlowInstanceRef.current
    if (!instance) {
      setCanvasSelection(null)
      return
    }
    const start = instance.screenToFlowPosition(drag.startClient)
    const end = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const items = resolveCanvasArrangementSelectionFromCandidates({
      arrangement,
      candidates: drag.candidates,
      selection: normalizeCanvasArrangementSelectionRect(start, end)
    })

    setCanvasSelection(
      items.length === 0
        ? null
        : {
            items,
            rect: null
          }
    )
    event.preventDefault()
    event.stopPropagation()
  }

  function cancelSelection(event: ReactPointerEvent<HTMLDivElement>): void {
    if (selectionDragRef.current?.pointerId !== event.pointerId) return
    selectionDragRef.current = null
    setCanvasSelection(null)
  }

  function placeFromCanvasClick(event: MouseEvent<HTMLDivElement>): void {
    if (
      !placementTemplate ||
      !onPlace ||
      (event.target as Element).closest('[data-workbench-canvas-obstruction]')
    ) {
      return
    }
    const origin = placementOrigin ?? resolvePlacementOrigin({ x: event.clientX, y: event.clientY })
    if (!origin) return

    event.preventDefault()
    event.stopPropagation()
    void onPlace(origin)
  }

  function resolvePlacementOrigin(screenPoint: {
    readonly x: number
    readonly y: number
  }): { readonly x: number; readonly y: number } | null {
    const instance = reactFlowInstanceRef.current
    if (!instance || !placementTemplate) return null

    return resolveBlockTemplatePlacement({
      desiredCenter: instance.screenToFlowPosition(screenPoint),
      occupiedRects: createWorkbenchNodeOccupancy(nodes),
      template: placementTemplate
    })
  }

  function resolveSelectionItems(
    startClient: { readonly x: number; readonly y: number },
    endClient: { readonly x: number; readonly y: number }
  ): CanvasArrangementSelection['items'] {
    const instance = reactFlowInstanceRef.current
    if (!instance || !graph) return []

    return resolveCanvasArrangementSelectionFromCandidates({
      arrangement,
      candidates: selectionDragRef.current?.candidates ?? [],
      selection: normalizeCanvasArrangementSelectionRect(
        instance.screenToFlowPosition(startClient),
        instance.screenToFlowPosition(endClient)
      )
    })
  }

  return {
    beginSelection,
    cancelSelection,
    canvasSelection,
    clearSelection: () => setCanvasSelection(null),
    completeSelection,
    continueInteraction,
    placementOrigin,
    placeFromCanvasClick
  }
}
