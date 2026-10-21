import { useMemo } from 'react'
import { PathIcon } from '@phosphor-icons/react/dist/csr/Path'
import type { TerminalFlowNode } from '../../../types/terminalFlowNode'
import { useWorkbenchObjectMotionPresentation } from '../useWorkbenchObjectMotionPresentation'
import { useI18n } from '../../../../i18n/useI18n'

export function TerminalWorkflowDragHandle({ data }: { readonly data: TerminalFlowNode['data'] }) {
  const { t } = useI18n()
  const motion = useMemo(
    () =>
      data.objectMotion
        ? {
            ...data.objectMotion,
            shellRect: undefined,
            offset: data.objectMotion.shellRect
              ? {
                  x: data.objectMotion.shellRect.from.x - data.objectMotion.shellRect.to.x,
                  y: data.objectMotion.shellRect.from.y - data.objectMotion.shellRect.to.y
                }
              : data.objectMotion.offset
          }
        : undefined,
    [data.objectMotion]
  )
  const { surfaceRef, style, className } = useWorkbenchObjectMotionPresentation(
    motion,
    undefined,
    data.isObjectMotionFrozen
  )
  return (
    <button
      type="button"
      ref={surfaceRef}
      style={style}
      className={`terminal-workflow-drag-handle nodrag nopan ${className}`}
      data-canvas-drag-target={JSON.stringify({
        type: 'workflow',
        terminalBlockIds: data.workflowDragTerminalIds
      })}
      data-canvas-drag-scope="workflow"
      data-canvas-drag-origin="canvas"
      aria-label={t('terminal.action.dragWorkflow', { name: data.block.name })}
      title={t('terminal.action.dragWorkflow', { name: data.block.name })}
    >
      <PathIcon size={13} aria-hidden="true" />
      <span>{data.block.name} → …</span>
    </button>
  )
}
