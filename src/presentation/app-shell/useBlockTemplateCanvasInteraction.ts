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
import type { ShortcutPlatform } from './applicationShortcuts'
import {
  isBlockTemplateSelectionModifier,
  normalizeBlockTemplateSelectionRect,
  resolveBlockTemplateSelectionBlockIds,
  type BlockTemplateSelectionRect
} from './blockTemplateSelection'
import { resolveBlockTemplatePlacement } from './blockTemplatePlacement'
import type { WorkbenchFlowNode } from './types'
import { createWorkbenchNodeOccupancy } from './workbenchNodeOccupancy'

export function useBlockTemplateCanvasInteraction({
  graph,
  nodes,
  onCancelPlacement,
  onPlace,
  placementTemplate,
  reactFlowInstanceRef,
  shortcutPlatform
}: {
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
    readonly startClient: { readonly x: number; readonly y: number }
    readonly startLocal: { readonly x: number; readonly y: number }
  } | null>(null)
  const [templateSelection, setTemplateSelection] = useState<{
    readonly blockIds: readonly string[]
    readonly rect: BlockTemplateSelectionRect
  } | null>(null)
  const [placementOrigin, setPlacementOrigin] = useState<{
    readonly x: number
    readonly y: number
  } | null>(null)

  useEffect(() => {
    setTemplateSelection(null)
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
      !isBlockTemplateSelectionModifier(event, shortcutPlatform) ||
      !(event.target as Element).closest('.react-flow__pane')
    ) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    selectionDragRef.current = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLocal: { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    }
    setTemplateSelection(null)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  function continueInteraction(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = selectionDragRef.current
    if (drag?.pointerId === event.pointerId) {
      const bounds = event.currentTarget.getBoundingClientRect()
      setTemplateSelection({
        blockIds: [],
        rect: normalizeBlockTemplateSelectionRect(drag.startLocal, {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top
        })
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
    if (!drag || drag.pointerId !== event.pointerId || !graph) return

    selectionDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const instance = reactFlowInstanceRef.current
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!instance) {
      setTemplateSelection(null)
      return
    }
    const start = instance.screenToFlowPosition(drag.startClient)
    const end = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const blockIds = resolveBlockTemplateSelectionBlockIds({
      graph,
      selection: normalizeBlockTemplateSelectionRect(start, end)
    })

    setTemplateSelection(
      blockIds.length === 0
        ? null
        : {
            blockIds,
            rect: normalizeBlockTemplateSelectionRect(drag.startLocal, {
              x: event.clientX - bounds.left,
              y: event.clientY - bounds.top
            })
          }
    )
    event.preventDefault()
    event.stopPropagation()
  }

  function cancelSelection(event: ReactPointerEvent<HTMLDivElement>): void {
    if (selectionDragRef.current?.pointerId !== event.pointerId) return
    selectionDragRef.current = null
    setTemplateSelection(null)
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

  return {
    beginSelection,
    cancelSelection,
    clearSelection: () => setTemplateSelection(null),
    completeSelection,
    continueInteraction,
    placementOrigin,
    placeFromCanvasClick,
    templateSelection
  }
}
