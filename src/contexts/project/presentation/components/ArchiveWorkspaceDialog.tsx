import { ArchiveIcon } from '@phosphor-icons/react/dist/csr/Archive'

import { ProjectSidebarConfirmationDialog } from './ProjectSidebarConfirmationDialog'
import { useI18n } from '../../../../presentation/i18n/useI18n'

interface ArchiveWorkspaceDialogProps {
  readonly gitBranch: string | null
  readonly isCurrentWorkspace: boolean
  readonly isLocked: boolean
  readonly lockReason: string | null
  readonly open: boolean
  readonly onExitComplete?: () => void
  readonly workspaceName: string
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

export function ArchiveWorkspaceDialog({
  gitBranch,
  isCurrentWorkspace,
  isLocked,
  lockReason,
  open,
  onExitComplete,
  workspaceName,
  onCancel,
  onConfirm
}: ArchiveWorkspaceDialogProps) {
  const { t } = useI18n()
  const isDetached = gitBranch === null
  const ariaLabel = isLocked
    ? t('archive.unlockDialog', { workspaceName })
    : t('archive.dialog', { workspaceName })
  const description = isLocked
    ? t('archive.lockedDescription', {
        lockReason: lockReason ?? t('archive.missingLockReason')
      })
    : isDetached
      ? t('archive.detachedDescription')
      : t('archive.description', { workspaceName })
  const detail = isDetached
    ? [t('archive.detachedDetail'), isCurrentWorkspace ? t('archive.currentDetail') : null]
        .filter(Boolean)
        .join(' ')
    : isLocked
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
      icon={<ArchiveIcon size={16} weight="bold" aria-hidden="true" />}
      open={open}
      onExitComplete={onExitComplete}
      title={ariaLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}
