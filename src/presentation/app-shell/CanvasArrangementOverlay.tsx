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
  selection
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
  readonly selection: CanvasArrangementSelection | null
}) {
  const isActionable = selection?.rect === null && selection.items.length >= 2
  const selectedStack = selection ? findCanvasArrangementStack(arrangement, selection.items) : null
  const selectedIsStacked = selectedStack !== null
  const [presentedIsStacked, setPresentedIsStacked] = useState(selectedIsStacked)
  const isStackPresentationChanged = isActionable && presentedIsStacked !== selectedIsStacked
  if (isStackPresentationChanged) setPresentedIsStacked(selectedIsStacked)
  const resolvedIsStacked = isStackPresentationChanged ? selectedIsStacked : presentedIsStacked
  const requestArrangement = (action: 'detach-stack' | 'grid' | 'stack'): void => {
    if (!selection || selection.items.length < 2 || !onArrange) return
    void onArrange(action, selection.items)
  }

  return (
    <>
      <CanvasArrangementToolbar
        isPending={isPending}
        isStacked={resolvedIsStacked}
        labels={labels}
        onGrid={() => requestArrangement('grid')}
        onToggleStack={() => requestArrangement(selectedStack ? 'detach-stack' : 'stack')}
        open={isActionable}
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
