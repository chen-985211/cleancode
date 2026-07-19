import type { ReactNode } from 'react'
import { useI18n } from './i18n/useI18n'

interface ProjectSidebarConfirmationDialogProps {
  readonly ariaLabel: string
  readonly confirmLabel: string
  readonly description: string
  readonly detail?: string
  readonly icon: ReactNode
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
  title,
  onCancel,
  onConfirm
}: ProjectSidebarConfirmationDialogProps) {
  const { t } = useI18n()
  return (
    <div className="project-sidebar-confirmation-dialog__backdrop">
      <div
        className="project-sidebar-confirmation-dialog"
        role="dialog"
        aria-label={ariaLabel}
        aria-modal="true"
      >
        <div className="project-sidebar-confirmation-dialog__header">
          {icon}
          <span>{title}</span>
        </div>
        <p>{description}</p>
        {detail ? <p>{detail}</p> : null}
        <div className="project-sidebar-confirmation-dialog__actions">
          <button type="button" autoFocus onClick={onCancel}>
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
    </div>
  )
}
