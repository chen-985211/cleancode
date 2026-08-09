import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { AnchoredSurfaceMotion } from './SurfaceMotion'
import { useI18n } from './i18n/useI18n'
import { useOutsidePointerDismiss } from './useOutsidePointerDismiss'

interface ProjectSidebarProjectRemovalPopoverProps {
  readonly open: boolean
  readonly projectName: string
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ProjectSidebarProjectRemovalPopover({
  open,
  projectName,
  triggerRef,
  onCancel,
  onConfirm
}: ProjectSidebarProjectRemovalPopoverProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  const cancelAndRestoreFocus = useCallback((): void => {
    onCancel()
    triggerRef.current?.focus()
  }, [onCancel, triggerRef])

  useOutsidePointerDismiss({
    active: open,
    isInside: (target) =>
      rootRef.current?.contains(target) === true || triggerRef.current?.contains(target) === true,
    onDismiss: cancelAndRestoreFocus,
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!open) return undefined

    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      cancelAndRestoreFocus()
    }

    document.addEventListener('keydown', cancelOnEscape)

    return () => {
      document.removeEventListener('keydown', cancelOnEscape)
    }
  }, [cancelAndRestoreFocus, open, triggerRef])

  useLayoutEffect(() => {
    if (open) cancelButtonRef.current?.focus()
  }, [open])

  return (
    <AnchoredSurfaceMotion
      className="project-removal-popover anchored-surface-motion"
      ref={rootRef}
      open={open}
      role="dialog"
      aria-label={t('projectRemoval.dialog', { projectName })}
    >
      <strong>{t('projectRemoval.title')}</strong>
      <p>{t('projectRemoval.description')}</p>
      <div className="project-removal-popover__actions">
        <button ref={cancelButtonRef} type="button" onClick={cancelAndRestoreFocus}>
          {t('common.cancel')}
        </button>
        <button className="project-removal-popover__confirm" type="button" onClick={onConfirm}>
          {t('common.remove')}
        </button>
      </div>
    </AnchoredSurfaceMotion>
  )
}
