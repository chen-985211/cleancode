import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { InfoIcon } from '@phosphor-icons/react/dist/csr/Info'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { ArrowRightIcon } from '@phosphor-icons/react/dist/csr/ArrowRight'
import { ArrowLeftIcon } from '@phosphor-icons/react/dist/csr/ArrowLeft'
import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import { GitHubMarkIcon } from '../../../../presentation/shared/components/GitHubMarkIcon'
import { PencilSimpleIcon } from '@phosphor-icons/react/dist/csr/PencilSimple'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { CircleDashedIcon } from '@phosphor-icons/react/dist/csr/CircleDashed'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'
import type { StartIssueWorkspaceCommand } from '../../application/dto/ProjectIssues'
import { useOutsidePointerDismiss } from '../../../../presentation/shared/hooks/useOutsidePointerDismiss'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { resolveUserFacingErrorMessage } from '../../../../presentation/shared/errors/appErrorMessages'
import { isSerializedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { useProjectIssues } from '../view-models/useProjectIssues'
import { IssueMenuSelect } from './IssueMenuSelect'
import { ProjectIssueDetails } from './ProjectIssueDetails'

export function ProjectIssuesPanel({
  project,
  title,
  projectSelector,
  open = true,
  onClose,
  onStart,
  onOpenWorkspace,
  onWorkspaceStarted = onClose,
  onProjectChanged
}: {
  readonly project: ProjectSnapshot
  readonly title?: string
  readonly projectSelector?: ReactNode
  readonly open?: boolean
  readonly onClose: () => void
  readonly onStart: (command: StartIssueWorkspaceCommand) => Promise<boolean>
  readonly onOpenWorkspace: (id: string) => void
  readonly onWorkspaceStarted?: () => void
  readonly onProjectChanged: (project: ProjectSnapshot) => void
}) {
  const { t } = useI18n()
  const model = useProjectIssues(project, open)
  const [action, setAction] = useState<{ projectId: string; busy: boolean; error?: unknown }>()
  const busy = action?.projectId === project.id && action.busy
  const [configuringProject, setConfiguringProject] = useState<string>()
  const repositoryFormRef = useRef<HTMLFormElement>(null)
  const restoreRepositoryFocus = useRef(true)
  const sourceRef = useRef<HTMLButtonElement>(null)
  const editingProjectRef = useRef<string | undefined>(undefined)
  const selectedRowRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const wasDetail = useRef(false)
  const liveProject = useRef(project.id)
  useLayoutEffect(() => {
    liveProject.current = project.id
  }, [project.id])
  const selected = model.selected
  const detailVisible = Boolean(selected)
  useLayoutEffect(() => {
    if (!open) return
    if (detailVisible) backRef.current?.focus()
    else if (wasDetail.current) selectedRowRef.current?.focus({ preventScroll: true })
    wasDetail.current = detailVisible
  }, [detailVisible, open])
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return
    const projectId = project.id
    setAction({ projectId, busy: true })
    try {
      await operation()
      setAction({ projectId, busy: false })
    } catch (error) {
      setAction({ projectId, busy: false, error })
    }
  }
  const actionError = action?.projectId === project.id ? action.error : undefined
  const error = actionError ?? model.error ?? model.detailError
  const failedRepository = isSerializedAppError(model.error)
    ? model.error.details?.repository
    : undefined
  const repository =
    model.data?.repository.name ??
    (typeof failedRepository === 'string' ? failedRepository : project.issueRepository) ??
    ''
  const linked = selected
    ? project.workspaces.find((workspace) => workspace.issue?.id === selected.id)
    : undefined
  const configuring = configuringProject === project.id
  const cancelRepositoryEdit = (restoreFocus = true) => {
    if (busy) return
    restoreRepositoryFocus.current = restoreFocus
    model.update({ repositoryDraft: undefined })
    setConfiguringProject(undefined)
  }
  useOutsidePointerDismiss({
    active: configuring && open && !busy,
    pointerPolicy: 'passthrough',
    isInside: (target) => Boolean(repositoryFormRef.current?.contains(target)),
    onDismiss: () => cancelRepositoryEdit(false)
  })
  useLayoutEffect(() => {
    if (
      !configuring &&
      open &&
      restoreRepositoryFocus.current &&
      editingProjectRef.current === project.id
    )
      sourceRef.current?.focus({ preventScroll: true })
    editingProjectRef.current = configuring ? project.id : undefined
  }, [configuring, open, project.id])

  return (
    <aside
      id="project-issues-panel"
      className="project-issues"
      aria-label={title ?? t('issues.panel')}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key !== 'Escape') return
        event.preventDefault()
        if (configuring) cancelRepositoryEdit()
        else if (selected) model.update({ detailOpen: false })
        else onClose()
      }}
    >
      <header className="project-issues__header">
        <div className="project-issues__heading">
          <div className="project-issues__project">
            {projectSelector ?? <span>{project.name}</span>}
          </div>
          <div className="project-issues__source-control">
            {configuring ? (
              <form
                ref={repositoryFormRef}
                className="project-issues__repository"
                onSubmit={(event) => {
                  event.preventDefault()
                  void run(async () => {
                    const updated = await window.cleancode!.configureProjectIssues({
                      projectDirectory: project.directory,
                      repository: model.view.repositoryDraft ?? repository
                    })
                    onProjectChanged(updated)
                    if (liveProject.current === project.id) {
                      model.update({ repositoryDraft: undefined })
                      setConfiguringProject(undefined)
                      model.refresh()
                    }
                  })
                }}
              >
                <GitHubMarkIcon size={16} />
                <input
                  aria-label={t('issues.repository')}
                  autoFocus
                  value={model.view.repositoryDraft ?? repository}
                  placeholder={t('issues.repositoryPlaceholder')}
                  onChange={(event) => model.update({ repositoryDraft: event.target.value })}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  className="icon-button"
                  aria-label={t('issues.saveRepository')}
                  title={t('issues.saveRepository')}
                  type="submit"
                  disabled={busy || !(model.view.repositoryDraft ?? repository).trim()}
                >
                  <CheckIcon size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  onClick={() => cancelRepositoryEdit()}
                  aria-label={t('common.cancel')}
                  title={t('common.cancel')}
                >
                  <XIcon size={16} aria-hidden="true" />
                </button>
              </form>
            ) : (
              <TooltipLabel content={t('issues.sourceHint')} side="bottom">
                <button
                  ref={sourceRef}
                  className="project-issues__source"
                  type="button"
                  aria-expanded={configuring}
                  onClick={() => {
                    restoreRepositoryFocus.current = true
                    model.update({ repositoryDraft: repository })
                    setConfiguringProject(project.id)
                  }}
                >
                  <GitHubMarkIcon size={16} />
                  <span>{repository || t('issues.configureRepository')}</span>
                  <PencilSimpleIcon size={13} aria-hidden="true" />
                </button>
              </TooltipLabel>
            )}
          </div>
        </div>
        <div className="project-issues__header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={t('issues.refresh')}
            title={t('issues.refresh')}
            onClick={model.refresh}
          >
            <ArrowClockwiseIcon size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={t('issues.close')}
            title={t('issues.close')}
            onClick={onClose}
          >
            <XIcon size={17} />
          </button>
        </div>
      </header>
      {error && (!model.error || actionError) ? (
        <div role="alert" className="project-issues__error">
          <InfoIcon size={17} aria-hidden="true" />
          {resolveUserFacingErrorMessage(error, 'issues.failed', t)}
        </div>
      ) : null}
      <div className="project-issues__browser" hidden={Boolean(selected)}>
        <form
          className="project-issues__filters"
          onSubmit={(event) => {
            event.preventDefault()
            model.update({ query: model.view.search, limit: 50 })
          }}
        >
          <div className="project-issues__search">
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <input
              type="search"
              aria-label={t('issues.search')}
              placeholder={t('issues.search')}
              value={model.view.search}
              onChange={(event) => model.update({ search: event.target.value })}
            />
            <button
              className="icon-button"
              type="submit"
              aria-label={t('issues.searchAction')}
              title={t('issues.searchAction')}
            >
              <ArrowRightIcon size={15} />
            </button>
          </div>
          <button
            className="toolbar-button project-issues__filter"
            type="button"
            aria-pressed={model.view.assignedToMe}
            onClick={() => model.update({ assignedToMe: !model.view.assignedToMe, limit: 50 })}
          >
            {t('issues.mine')}
          </button>
          <IssueMenuSelect
            label={t('issues.label')}
            value={model.view.label}
            onChange={(value) => model.update({ label: value, limit: 50 })}
            options={[
              { value: '', label: t('issues.allLabels') },
              ...Array.from(
                new Set([
                  ...(model.view.label ? [model.view.label] : []),
                  ...(model.data?.issues.flatMap((issue) => issue.labels) ?? [])
                ])
              ).map((label) => ({ value: label, label }))
            ]}
          />
        </form>
        <div
          className="project-issues__list"
          aria-label={t('issues.list')}
          aria-busy={model.loading}
        >
          <div className="project-issues__columns" aria-hidden="true">
            <span>{t('issues.list')}</span>
            <span>{t('issues.assignees')}</span>
            <span>{t('issues.workspace')}</span>
          </div>
          {model.error ? (
            <div role="alert" aria-atomic="true" className="project-issues__unavailable">
              <h2>
                {t(
                  isSerializedAppError(model.error) && model.error.code === 'GITHUB_ISSUES_DISABLED'
                    ? 'issues.disabledTitle'
                    : 'issues.unavailableTitle'
                )}
              </h2>
              <p>
                {isSerializedAppError(model.error) && model.error.code === 'GITHUB_ISSUES_DISABLED'
                  ? t('issues.disabledDescription')
                  : resolveUserFacingErrorMessage(model.error, 'issues.failed', t)}
              </p>
            </div>
          ) : model.loading ? (
            <p className="project-issues__empty" role="status">
              {t('issues.loading')}
            </p>
          ) : !model.data?.issues.length ? (
            <div className="project-issues__unavailable">
              <h2>{t('issues.empty')}</h2>
              <p>{t('issues.emptyDescription')}</p>
            </div>
          ) : null}
          {model.data?.issues.map((issue) => {
            const workspace = project.workspaces.find((item) => item.issue?.id === issue.id)
            return (
              <button
                key={issue.id}
                ref={model.view.selectedId === issue.id ? selectedRowRef : undefined}
                className="project-issues__row"
                type="button"
                aria-label={issue.title}
                onClick={() => model.update({ selectedId: issue.id, detailOpen: true })}
              >
                <span className="project-issues__row-main">
                  <CircleDashedIcon
                    className="project-issues__issue-icon"
                    size={17}
                    aria-hidden="true"
                  />
                  <span className="project-issues__row-content">
                    <span className="project-issues__row-title">{issue.title}</span>
                    <span className="project-issues__row-meta">
                      <span>#{issue.number}</span>
                      {issue.labels.slice(0, 3).map((label) => (
                        <span className="project-issues__label" key={label}>
                          {label}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
                <span className="project-issues__assignees">
                  {issue.assignees.map((login) => `@${login}`).join(', ') || '—'}
                </span>
                <span className="project-issues__workspace">
                  {workspace ? (
                    <>
                      <GitBranchIcon size={14} aria-hidden="true" />
                      <span>{workspace.displayName}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </span>
              </button>
            )
          })}
          {model.data?.hasMore ? (
            <button
              className="toolbar-button project-issues__more"
              type="button"
              disabled={model.view.limit >= 500}
              onClick={() => model.update({ limit: Math.min(500, model.view.limit + 50) })}
            >
              {t(model.view.limit >= 500 ? 'issues.refineSearch' : 'issues.loadMore')}
            </button>
          ) : null}
        </div>
      </div>
      {selected && model.data ? (
        <div className="project-issues__reader">
          <nav className="project-issues__detail-nav">
            <button
              ref={backRef}
              className="toolbar-button"
              type="button"
              onClick={() => model.update({ detailOpen: false })}
            >
              <ArrowLeftIcon size={16} aria-hidden="true" />
              {t('issues.backToList')}
            </button>
          </nav>
          <ProjectIssueDetails
            key={`${project.id}:${selected.id}`}
            issue={selected}
            detail={model.detail}
            loading={!model.detail && !model.detailError}
            defaultBranch={model.data.repository.defaultBranch}
            workspace={linked}
            busy={busy}
            onOpenWorkspace={onOpenWorkspace}
            onStart={(values) =>
              void run(async () => {
                const success = await onStart({
                  projectDirectory: project.directory,
                  repository: selected.repository,
                  number: selected.number,
                  ...values
                })
                if (success && liveProject.current === project.id) onWorkspaceStarted()
              })
            }
          />
        </div>
      ) : null}
    </aside>
  )
}
