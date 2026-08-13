import type { Edge, ReactFlowInstance } from '@xyflow/react'
import type { MutableRefObject } from 'react'

import type {
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import type { ShortcutPlatform } from './applicationShortcuts'
import { CanvasArrangementOverlay } from './CanvasArrangementOverlay'
import type {
  CanvasArrangementSelection,
  CanvasArrangementSelectionItem
} from './canvasArrangementSelection'
import { useI18n } from './i18n/useI18n'
import { focusQuickExecutionTargetInCanvas } from './quickExecutionFocus'
import { QuickExecutionBar } from './QuickExecutionBar'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'

export type ArrangeCanvasSelectionHandler = (
  action: 'detach-stack' | 'grid' | 'stack',
  items: readonly CanvasArrangementSelectionItem[]
) => Promise<void> | void

export function WorkbenchCanvasBottomControls({
  arrangement,
  currentWorkbench,
  isArrangementPending,
  isQuickExecutionDropTarget,
  onAddQuickExecutionTarget,
  onArrange,
  onBindQuickExecutionSlot,
  onClearQuickExecutionSlot,
  onReorderQuickExecutionSlots,
  reactFlowInstanceRef,
  selection,
  shortcutPlatform,
  shortcutTooltips
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isArrangementPending: boolean
  readonly isQuickExecutionDropTarget: boolean
  readonly onAddQuickExecutionTarget?: (
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onArrange?: ArrangeCanvasSelectionHandler
  readonly onBindQuickExecutionSlot?: (
    number: QuickExecutionSlotNumber,
    target: QuickExecutionTargetSnapshot
  ) => Promise<void> | void
  readonly onClearQuickExecutionSlot?: (number: QuickExecutionSlotNumber) => Promise<void> | void
  readonly onReorderQuickExecutionSlots?: (
    sourceNumber: QuickExecutionSlotNumber,
    destinationNumber: QuickExecutionSlotNumber
  ) => Promise<void> | void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly selection: CanvasArrangementSelection | null
  readonly shortcutPlatform: ShortcutPlatform
  readonly shortcutTooltips: Partial<ApplicationShortcutTooltipLabels>
}) {
  const { t } = useI18n()
  const hasArrangementSelection = (selection?.items.length ?? 0) >= 2
  const canShowQuickExecution =
    !hasArrangementSelection &&
    currentWorkbench &&
    onAddQuickExecutionTarget &&
    onBindQuickExecutionSlot &&
    onClearQuickExecutionSlot &&
    onReorderQuickExecutionSlots

  return (
    <>
      {canShowQuickExecution ? (
        <QuickExecutionBar
          isExternalDropTarget={isQuickExecutionDropTarget}
          graph={currentWorkbench.graph}
          onAdd={onAddQuickExecutionTarget}
          onBind={onBindQuickExecutionSlot}
          onClear={onClearQuickExecutionSlot}
          onFocus={(target) =>
            focusQuickExecutionTargetInCanvas({
              instance: reactFlowInstanceRef.current,
              target,
              terminalGroups: currentWorkbench.graph.terminalGroups
            })
          }
          onReorder={onReorderQuickExecutionSlots}
          shortcutPlatform={shortcutPlatform}
          shortcutTooltips={shortcutTooltips}
        />
      ) : null}
      <CanvasArrangementOverlay
        arrangement={arrangement}
        isPending={isArrangementPending}
        labels={{
          detach: t('canvas.arrangement.detach'),
          grid: t('canvas.arrangement.grid'),
          stack: t('canvas.arrangement.stack'),
          toolbar: t('canvas.arrangement.toolbar')
        }}
        onArrange={onArrange}
        selection={selection}
      />
    </>
  )
}
