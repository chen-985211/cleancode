import { FoldersIcon } from '@phosphor-icons/react/dist/csr/Folders'
import type { FormEvent, RefObject } from 'react'
import { ChoiceSelect } from '../../../../presentation/shared/components/ChoiceSelect'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { useBranchWorkspaceFormSpring } from '../motion/useBranchWorkspaceFormSpring'

interface ProjectSidebarBranchWorkspaceFormProps {
  readonly isSubmitting?: boolean
  readonly base: {
    readonly branches: readonly string[]
    readonly value: string
    readonly loading: boolean
    readonly failed: boolean
    readonly select: (ref: string) => void
    readonly retry: () => void
  }
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
  base,
  branchName,
  isSubmitting = false,
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

  const refs = new Set(base.branches)
  const options = base.branches.map((ref) => {
    const name = ref.replace(/^refs\/(heads|remotes)\//, '')
    const ambiguous = refs.has(`refs/heads/${name}`) && refs.has(`refs/remotes/${name}`)
    return { value: ref, label: ambiguous ? ref : name }
  })
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
        <input
          aria-label={t('branchWorkspace.branchName')}
          value={branchName}
          disabled={isSubmitting}
          onChange={(event) => onBranchNameChange(event.target.value)}
          placeholder={t('branchWorkspace.newBranchPlaceholder')}
        />
        <label className="branch-workspace-base">
          <span>{t('branchWorkspace.basedOn')}</span>
          {base.failed ? (
            <button type="button" onClick={base.retry}>
              {t('branchWorkspace.retryBases')}
            </button>
          ) : (
            <ChoiceSelect
              active={open && !isSubmitting && options.length > 0}
              label={t('branchWorkspace.baseBranch')}
              value={
                base.value ||
                t(base.loading ? 'branchWorkspace.loadingBases' : 'branchWorkspace.noBases')
              }
              options={options}
              menuClassName="branch-workspace-base-menu"
              onChange={base.select}
            />
          )}
        </label>
        <button type="submit" disabled={isSubmitting || !branchName.trim() || !base.value}>
          <FoldersIcon size={13} weight="bold" aria-hidden="true" />
          <span>{t('branchWorkspace.createWorktree')}</span>
        </button>
      </form>
    </div>
  )
}
