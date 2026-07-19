import { useEffect, useRef, type RefObject } from 'react'
import { useI18n } from './i18n/useI18n'

interface ProjectSidebarProjectRemovalPopoverProps {
  readonly projectName: string
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ProjectSidebarProjectRemovalPopover({
  projectName,
  triggerRef,
  onCancel,
  onConfirm
}: ProjectSidebarProjectRemovalPopoverProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cancelWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (
        target instanceof Node &&
        (rootRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return
      }

      onCancel()
    }

    document.addEventListener('pointerdown', cancelWhenClickingOutside)

    return () => document.removeEventListener('pointerdown', cancelWhenClickingOutside)
  }, [onCancel, triggerRef])

  return (
    <div
      className="project-removal-popover"
      ref={rootRef}
      role="dialog"
      aria-label={t('projectRemoval.dialog', { projectName })}
    >
      <strong>{t('projectRemoval.title')}</strong>
      <p>{t('projectRemoval.description')}</p>
      <div className="project-removal-popover__actions">
        <button type="button" autoFocus onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button className="project-removal-popover__confirm" type="button" onClick={onConfirm}>
          {t('common.remove')}
        </button>
      </div>
    </div>
  )
}
