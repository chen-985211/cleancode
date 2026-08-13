import { useState } from 'react'

import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { CanvasArrangementToolbar } from './CanvasArrangementToolbar'
import {
  findCanvasArrangementStack,
  type CanvasArrangementSelection,
  type CanvasArrangementSelectionItem
} from './canvasArrangementSelection'

export function CanvasArrangementOverlay({
  arrangement,
  isPending,
  labels,
  onArrange,
  onToolbarExitComplete,
  selection,
  toolbarOpen
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly isPending: boolean
  readonly labels: {
    readonly detach: string
    readonly grid: string
    readonly stack: string
    readonly toolbar: string
  }
  readonly onArrange?: (
    action: 'detach-stack' | 'grid' | 'stack',
    items: readonly CanvasArrangementSelectionItem[]
  ) => Promise<void> | void
  readonly onToolbarExitComplete?: () => void
  readonly selection: CanvasArrangementSelection | null
  readonly toolbarOpen?: boolean
}) {
  const hasSelection = (selection?.items.length ?? 0) > 0
  const canArrange = selection?.rect === null && selection.items.length >= 2
  const selectedStack = selection ? findCanvasArrangementStack(arrangement, selection.items) : null
  const selectedIsStacked = selectedStack !== null
  const [presentedIsStacked, setPresentedIsStacked] = useState(selectedIsStacked)
  const isStackPresentationChanged = hasSelection && presentedIsStacked !== selectedIsStacked
  if (isStackPresentationChanged) setPresentedIsStacked(selectedIsStacked)
  const resolvedIsStacked = isStackPresentationChanged ? selectedIsStacked : presentedIsStacked
  const requestArrangement = (action: 'detach-stack' | 'grid' | 'stack'): void => {
    if (!selection || selection.items.length < 2 || !onArrange) return
    void onArrange(action, selection.items)
  }

  return (
    <>
      <CanvasArrangementToolbar
        canArrange={canArrange}
        isPending={isPending}
        isStacked={resolvedIsStacked}
        labels={labels}
        onGrid={() => requestArrangement('grid')}
        onExitComplete={onToolbarExitComplete}
        onToggleStack={() => requestArrangement(selectedStack ? 'detach-stack' : 'stack')}
        open={toolbarOpen ?? hasSelection}
      />
      {selection?.rect ? (
        <div
          className="canvas-arrangement-selection"
          style={{
            left: selection.rect.x,
            top: selection.rect.y,
            width: selection.rect.width,
            height: selection.rect.height
          }}
        />
      ) : null}
    </>
  )
}
