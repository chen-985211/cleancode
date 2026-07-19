import { Folders } from 'lucide-react'
import type { FormEvent, RefObject } from 'react'
import { useI18n } from './i18n/useI18n'

interface ProjectSidebarBranchWorkspaceFormProps {
  readonly branchName: string
  readonly formRef: RefObject<HTMLFormElement | null>
  readonly projectId: string
  readonly onBranchNameChange: (branchName: string) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function ProjectSidebarBranchWorkspaceForm({
  branchName,
  formRef,
  projectId,
  onBranchNameChange,
  onSubmit
}: ProjectSidebarBranchWorkspaceFormProps) {
  const { t } = useI18n()
  return (
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
        <Folders size={13} aria-hidden="true" />
        <span>{t('branchWorkspace.createWorktree')}</span>
      </button>
    </form>
  )
}
