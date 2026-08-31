import { useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { OverlaySurfaceMotion } from './AppShellSurfaceMotion'
import { useI18n } from '../i18n/useI18n'

interface ProjectSidebarConfirmationDialogProps {
  readonly ariaLabel: string
  readonly confirmLabel: string
  readonly description: string
  readonly detail?: string
  readonly icon: ReactNode
  readonly open: boolean
  readonly onExitComplete?: () => void
  readonly title: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ProjectSidebarConfirmationDialog({
  ariaLabel,
  confirmLabel,
  description,
  detail,
  icon,
  open,
  onExitComplete,
  title,
  onCancel,
  onConfirm
}: ProjectSidebarConfirmationDialogProps) {
  const { t } = useI18n()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const cancelOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onCancel()
    }
    document.addEventListener('keydown', cancelOnEscape)
    return () => document.removeEventListener('keydown', cancelOnEscape)
  }, [onCancel, open])

  useLayoutEffect(() => {
    if (open) cancelButtonRef.current?.focus()
  }, [open])

  return (
    <OverlaySurfaceMotion
      className="project-sidebar-confirmation-dialog__backdrop overlay-surface-motion overlay-surface-motion--dialog"
      role="dialog"
      aria-label={ariaLabel}
      aria-modal="true"
      open={open}
      onExitComplete={onExitComplete}
      onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="project-sidebar-confirmation-dialog overlay-surface-motion__content">
        <div className="project-sidebar-confirmation-dialog__header">
          {icon}
          <span>{title}</span>
        </div>
        <p>{description}</p>
        {detail ? <p>{detail}</p> : null}
        <div className="project-sidebar-confirmation-dialog__actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className="project-sidebar-confirmation-dialog__confirm"
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </OverlaySurfaceMotion>
  )
}
