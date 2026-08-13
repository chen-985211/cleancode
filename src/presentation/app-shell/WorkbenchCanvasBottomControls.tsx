import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useState, type MutableRefObject } from 'react'

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

type CanvasBottomControl = 'arrangement' | 'quick-execution'

interface CanvasBottomControlHandoffState {
  readonly active: CanvasBottomControl | null
  readonly quickExecutionAvailable: boolean
  readonly requested: CanvasBottomControl | null
}

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
  const hasCanvasSelection = (selection?.items.length ?? 0) > 0
  const canRenderQuickExecution =
    currentWorkbench &&
    onAddQuickExecutionTarget &&
    onBindQuickExecutionSlot &&
    onClearQuickExecutionSlot &&
    onReorderQuickExecutionSlots
  const requestedBottomControl: CanvasBottomControl | null = hasCanvasSelection
    ? 'arrangement'
    : canRenderQuickExecution
      ? 'quick-execution'
      : null
  const bottomControlHandoff = useCanvasBottomControlHandoff({
    quickExecutionAvailable: Boolean(canRenderQuickExecution),
    requested: requestedBottomControl
  })

  return (
    <>
      {canRenderQuickExecution ? (
        <QuickExecutionBar
          isExternalDropTarget={isQuickExecutionDropTarget}
          graph={currentWorkbench.graph}
          onExitComplete={() => bottomControlHandoff.completeExit('quick-execution')}
          open={bottomControlHandoff.quickExecutionOpen}
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
        onToolbarExitComplete={() => bottomControlHandoff.completeExit('arrangement')}
        selection={selection}
        toolbarOpen={bottomControlHandoff.arrangementOpen}
      />
    </>
  )
}

function useCanvasBottomControlHandoff({
  quickExecutionAvailable,
  requested
}: {
  readonly quickExecutionAvailable: boolean
  readonly requested: CanvasBottomControl | null
}): {
  readonly arrangementOpen: boolean
  readonly completeExit: (control: CanvasBottomControl) => void
  readonly quickExecutionOpen: boolean
} {
  const input = { quickExecutionAvailable, requested }
  const [renderedState, setRenderedState] = useState<CanvasBottomControlHandoffState>(() => ({
    active: requested,
    ...input
  }))
  const inputChanged =
    renderedState.requested !== requested ||
    renderedState.quickExecutionAvailable !== quickExecutionAvailable
  const state = inputChanged
    ? synchronizeCanvasBottomControlHandoff(renderedState, input)
    : renderedState
  if (inputChanged) setRenderedState(state)

  const completeExit = useCallback((control: CanvasBottomControl): void => {
    setRenderedState((current) =>
      current.active === control ? { ...current, active: current.requested } : current
    )
  }, [])

  return {
    arrangementOpen: state.active === 'arrangement' && requested === 'arrangement',
    completeExit,
    quickExecutionOpen: state.active === 'quick-execution' && requested === 'quick-execution'
  }
}

function synchronizeCanvasBottomControlHandoff(
  state: CanvasBottomControlHandoffState,
  input: Omit<CanvasBottomControlHandoffState, 'active'>
): CanvasBottomControlHandoffState {
  const activeIsUnavailable = state.active === 'quick-execution' && !input.quickExecutionAvailable
  return {
    ...input,
    active: state.active === null || activeIsUnavailable ? input.requested : state.active
  }
}
