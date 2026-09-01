import { FoldersIcon } from '@phosphor-icons/react/dist/csr/Folders'
import type { FormEvent, RefObject } from 'react'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { useBranchWorkspaceFormSpring } from '../motion/useBranchWorkspaceFormSpring'

interface ProjectSidebarBranchWorkspaceFormProps {
  readonly branchName: string
  readonly formRef: RefObject<HTMLFormElement | null>
  readonly open: boolean
  readonly projectId: string
  readonly surfaceRef: RefObject<HTMLDivElement | null>
  readonly onBranchNameChange: (branchName: string) => void
  readonly onExitComplete: () => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProjectSidebarBranchWorkspaceForm({
  branchName,
  formRef,
  open,
  projectId,
  surfaceRef,
  onBranchNameChange,
  onExitComplete,
  onSubmit
}: ProjectSidebarBranchWorkspaceFormProps) {
  const { t } = useI18n()
  const presence = useBranchWorkspaceFormSpring(open, surfaceRef, onExitComplete)
  if (!presence.isPresent) return null

  return (
    <div
      id={`${projectId}-branch-workspace-form`}
      className="branch-workspace-surface"
      ref={surfaceRef}
      role="dialog"
      aria-label={t('sidebar.newBranchWorkspace')}
      {...presence.surfaceProps}
    >
      <form className="branch-workspace-form" ref={formRef} onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={`${projectId}-branch-name`}>
          {t('branchWorkspace.branchName')}
        </label>
        <input
          id={`${projectId}-branch-name`}
          value={branchName}
          onChange={(event) => onBranchNameChange(event.target.value)}
          placeholder={t('branchWorkspace.newBranchPlaceholder')}
        />
        <button type="submit">
          <FoldersIcon size={13} weight="bold" aria-hidden="true" />
          <span>{t('branchWorkspace.createWorktree')}</span>
        </button>
      </form>
    </div>
  )
}
