import { Archive } from 'lucide-react'

import { ProjectSidebarConfirmationDialog } from './ProjectSidebarConfirmationDialog'
import { useI18n } from './i18n/useI18n'

interface ArchiveWorkspaceDialogProps {
  readonly isCurrentWorkspace: boolean
  readonly isLocked: boolean
  readonly lockReason: string | null
  readonly workspaceName: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ArchiveWorkspaceDialog({
  isCurrentWorkspace,
  isLocked,
  lockReason,
  workspaceName,
  onCancel,
  onConfirm
}: ArchiveWorkspaceDialogProps) {
  const { t } = useI18n()
  const ariaLabel = isLocked
    ? t('archive.unlockDialog', { workspaceName })
    : t('archive.dialog', { workspaceName })
  const description = isLocked
    ? t('archive.lockedDescription', {
        lockReason: lockReason ?? t('archive.missingLockReason')
      })
    : t('archive.description', { workspaceName })
  const detail = isLocked
    ? t('archive.lockedDetail', { workspaceName })
    : isCurrentWorkspace
      ? t('archive.currentDetail')
      : undefined

  return (
    <ProjectSidebarConfirmationDialog
      ariaLabel={ariaLabel}
      confirmLabel={isLocked ? t('archive.unlockConfirm') : t('archive.confirm')}
      description={description}
      detail={detail}
      icon={<Archive size={16} aria-hidden="true" />}
      title={ariaLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
