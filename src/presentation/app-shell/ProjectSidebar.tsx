import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { FoldersIcon } from '@phosphor-icons/react/dist/csr/Folders'
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch'
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus'
import { TrashIcon } from '@phosphor-icons/react/dist/csr/Trash'
import { XIcon } from '@phosphor-icons/react/dist/csr/X'
import { useCallback, useEffect, useRef, useState } from 'react'

import { BranchSelectorPopover } from './ProjectSidebarBranchSelector'
import { ArchiveWorkspaceDialog } from './ArchiveWorkspaceDialog'
import { ProjectSidebarBranchWorkspaceForm } from './ProjectSidebarBranchWorkspaceForm'
import { ProjectSidebarProjectRemovalPopover } from './ProjectSidebarProjectRemovalPopover'
import type { WorkbenchSnapshot } from './types'
import { useProjectSidebarBranchWorkspaceForm } from './useProjectSidebarBranchWorkspaceForm'
import { useI18n } from './i18n/useI18n'
import { useProjectSidebarReorder } from './useProjectSidebarReorder'
import { TooltipLabel } from './Tooltip'
import { WorkspaceRowMenu } from './WorkspaceRowMenu'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'

export interface ProjectSidebarIntent {
  readonly id: number
  readonly projectId: string
  readonly type: 'createBranchWorkspace' | 'revealProject'
}

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isCollapsed?: boolean
  readonly isDesktopRuntime: boolean
  readonly isReorderPending?: boolean
  readonly intent?: ProjectSidebarIntent | null
  readonly shortcutTooltips?: Pick<
    ApplicationShortcutTooltipLabels,
    'addProject' | 'createBranchWorkspace'
  >
  readonly actionError: string | null
  readonly onAddProject: () => void
  readonly onArchiveBranchWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceId: string,
    lockedWorktreeConfirmation?: { readonly lockReason: string | null }
  ) => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onDismissActionError: () => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onReorderProject: (
    workbench: WorkbenchSnapshot,
    beforeProjectDirectory: string | null
  ) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceId: string) => void
}

export function ProjectSidebar({
  workbenches,
  currentWorkbench,
  isCollapsed = false,
  isDesktopRuntime,
  isReorderPending = false,
  intent = null,
  shortcutTooltips,
  actionError,
  onAddProject,
  onArchiveBranchWorkspace,
  onCheckoutMainBranch,
  onCreateBranchWorkspace,
  onDismissActionError,
  onRemoveProject,
  onReorderProject,
  onSelectWorkspace
}: ProjectSidebarProps) {
  const { t } = useI18n()
  const addProjectTooltip = shortcutTooltips?.addProject ?? t('sidebar.addProject')
  const createBranchWorkspaceTooltip =
    shortcutTooltips?.createBranchWorkspace ?? t('sidebar.newBranchWorkspace')
  const projectListRef = useRef<HTMLDivElement>(null)
  const canReorderProjects = isDesktopRuntime && !isReorderPending && workbenches.length > 1
  const projectReorder = useProjectSidebarReorder({
    canReorder: canReorderProjects,
    getProjectList: () => projectListRef.current,
    onReorderProject,
    workbenches
  })
  return (
    <aside
      id="project-sidebar"
      className="project-sidebar"
      aria-hidden={isCollapsed || undefined}
      aria-label={t('sidebar.label')}
      inert={isCollapsed}
    >
      <div className="project-sidebar__actions">
        <TooltipLabel content={addProjectTooltip}>
          <button
            className="sidebar-action"
            type="button"
            onClick={onAddProject}
            disabled={!isDesktopRuntime}
          >
            <PlusIcon size={17} weight="bold" aria-hidden="true" />
            {t('sidebar.addProject')}
          </button>
        </TooltipLabel>
      </div>
      {!isDesktopRuntime ? (
        <div className="runtime-warning" role="status">
          {t('sidebar.previewWarning')}
        </div>
      ) : null}
      {actionError ? (
        <div className="project-sidebar-alert" role="alert">
          <span>{actionError}</span>
          <TooltipLabel content={t('sidebar.closeAlert')}>
            <button
              className="project-sidebar-alert__close"
              type="button"
              aria-label={t('sidebar.closeAlert')}
              onClick={onDismissActionError}
            >
              <XIcon size={13} weight="bold" aria-hidden="true" />
            </button>
          </TooltipLabel>
        </div>
      ) : null}
      <div className="project-sidebar__label">{t('sidebar.projects')}</div>
      <div
        className={
          projectReorder.draggingProjectId ? 'project-list project-list--dragging' : 'project-list'
        }
        ref={projectListRef}
      >
        {projectReorder.dropIndicatorY !== null ? (
          <div
            className="project-list__drop-indicator"
            role="presentation"
            style={{ top: projectReorder.dropIndicatorY }}
          >
            <span />
            <span />
            <span />
          </div>
        ) : null}
        {workbenches.map((workbench) => (
          <ProjectCard
            key={workbench.project.id}
            workbench={workbench}
            currentWorkbench={currentWorkbench}
            onArchiveBranchWorkspace={onArchiveBranchWorkspace}
            onCheckoutMainBranch={onCheckoutMainBranch}
            onCreateBranchWorkspace={onCreateBranchWorkspace}
            onRemoveProject={onRemoveProject}
            isDragging={projectReorder.draggingProjectId === workbench.project.id}
            canReorder={canReorderProjects}
            intent={intent?.projectId === workbench.project.id ? intent : null}
            createBranchWorkspaceTooltip={createBranchWorkspaceTooltip}
            onProjectPointerDown={projectReorder.onProjectPointerDown}
            onSelectWorkspace={onSelectWorkspace}
          />
        ))}
      </div>
    </aside>
  )
}

interface ProjectCardProps {
  readonly workbench: WorkbenchSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly onArchiveBranchWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceId: string,
    lockedWorktreeConfirmation?: { readonly lockReason: string | null }
  ) => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly isDragging: boolean
  readonly canReorder: boolean
  readonly intent: ProjectSidebarIntent | null
  readonly createBranchWorkspaceTooltip: string
  readonly onProjectPointerDown: (
    event: React.PointerEvent<HTMLElement>,
    workbench: WorkbenchSnapshot
  ) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceId: string) => void
}

function ProjectCard({
  workbench,
  currentWorkbench,
  onArchiveBranchWorkspace,
  onCheckoutMainBranch,
  onCreateBranchWorkspace,
  onRemoveProject,
  isDragging,
  canReorder,
  intent,
  createBranchWorkspaceTooltip,
  onProjectPointerDown,
  onSelectWorkspace
}: ProjectCardProps) {
  const { t } = useI18n()
  const isCurrentProject = currentWorkbench?.project.id === workbench.project.id
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [branchSearchQuery, setBranchSearchQuery] = useState('')
  const [openWorkspaceMenuId, setOpenWorkspaceMenuId] = useState<string | null>(null)
  const [archiveWorkspaceId, setArchiveWorkspaceId] = useState<string | null>(null)
  const [isRemoveProjectDialogOpen, setIsRemoveProjectDialogOpen] = useState(false)
  const [handledIntentId, setHandledIntentId] = useState<number | null>(null)
  const branchSelectorPopoverRef = useRef<HTMLDivElement>(null)
  const branchSelectorRootRef = useRef<HTMLDivElement>(null)
  const removeProjectButtonRef = useRef<HTMLButtonElement>(null)
  const {
    branchName,
    close: closeBranchWorkspaceForm,
    formRef,
    isOpen: isBranchWorkspaceFormOpen,
    open: openBranchWorkspaceForm,
    setBranchName,
    submit: submitBranchWorkspace,
    toggle: toggleBranchWorkspaceForm,
    triggerRef
  } = useProjectSidebarBranchWorkspaceForm((newBranchName) =>
    onCreateBranchWorkspace(workbench, newBranchName)
  )
  if (intent && intent.id !== handledIntentId) {
    setHandledIntentId(intent.id)
    setIsExpanded(true)
    setIsBranchSelectorOpen(false)
    setBranchSearchQuery('')
    setOpenWorkspaceMenuId(null)
    setIsRemoveProjectDialogOpen(false)
    if (intent.type === 'createBranchWorkspace') {
      openBranchWorkspaceForm()
    }
  }
  const archiveWorkspace = archiveWorkspaceId
    ? workbench.project.workspaces.find((workspace) => workspace.workspaceId === archiveWorkspaceId)
    : null
  const archiveWorkspaceGitBranch = archiveWorkspace
    ? workbench.gitBranches.find(
        (branch) =>
          branch.name === archiveWorkspace.gitBranch &&
          branch.worktreeDirectory === archiveWorkspace.directory
      )
    : null
  const closeBranchSelector = (): void => {
    setIsBranchSelectorOpen(false)
    setBranchSearchQuery('')
  }
  const toggleBranchSelector = (): void => {
    if (isBranchSelectorOpen) {
      closeBranchSelector()
      return
    }

    setIsBranchSelectorOpen(true)
  }
  const toggleProjectExpanded = (): void => {
    if (isExpanded) {
      closeBranchSelector()
      closeBranchWorkspaceForm()
      setOpenWorkspaceMenuId(null)
    }

    setIsExpanded((expanded) => !expanded)
  }
  const workspaceListId = `project-${workbench.project.id}-workspaces`
  const closeWorkspaceMenu = useCallback(() => {
    setOpenWorkspaceMenuId(null)
  }, [])
  const toggleWorkspaceMenu = useCallback((workspaceId: string) => {
    setOpenWorkspaceMenuId((menuId) => (menuId === workspaceId ? null : workspaceId))
  }, [])

  useEffect(() => {
    if (!isBranchSelectorOpen) {
      return undefined
    }

    const closeBranchSelectorWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (target instanceof Node) {
        if (
          branchSelectorRootRef.current?.contains(target) ||
          branchSelectorPopoverRef.current?.contains(target)
        ) {
          return
        }
      }

      closeBranchSelector()
    }

    document.addEventListener('pointerdown', closeBranchSelectorWhenClickingOutside)

    return () => {
      document.removeEventListener('pointerdown', closeBranchSelectorWhenClickingOutside)
    }
  }, [isBranchSelectorOpen])

  return (
    <section
      className={isDragging ? 'project-card project-card--dragging' : 'project-card'}
      data-project-card-id={workbench.project.id}
      role="group"
      aria-label={t('sidebar.projectGroup', { projectName: workbench.project.name })}
    >
      <div className="project-card__header">
        <TooltipLabel
          content={t(isExpanded ? 'sidebar.collapseProject' : 'sidebar.expandProject', {
            projectName: workbench.project.name
          })}
        >
          <button
            className={
              canReorder
                ? 'project-card__select project-card__select--draggable'
                : 'project-card__select'
            }
            type="button"
            aria-controls={workspaceListId}
            aria-expanded={isExpanded}
            aria-label={workbench.project.name}
            onClick={toggleProjectExpanded}
            onPointerDown={(event) => onProjectPointerDown(event, workbench)}
          >
            <span
              className={isCurrentProject ? 'project-dot project-dot--active' : 'project-dot'}
            />
            <span className="project-card__name truncate">{workbench.project.name}</span>
          </button>
        </TooltipLabel>
        <TooltipLabel
          content={
            isCurrentProject ? createBranchWorkspaceTooltip : t('sidebar.newBranchWorkspace')
          }
        >
          <button
            className="project-card__branch icon-button"
            type="button"
            aria-label={t('sidebar.newBranchWorkspace')}
            ref={triggerRef}
            onClick={toggleBranchWorkspaceForm}
          >
            <PlusIcon size={14} weight="bold" aria-hidden="true" />
          </button>
        </TooltipLabel>
        <TooltipLabel content={t('sidebar.removeProjectFromList')}>
          <button
            className="project-card__remove icon-button"
            type="button"
            aria-label={t('sidebar.removeProject')}
            ref={removeProjectButtonRef}
            onClick={() => setIsRemoveProjectDialogOpen((isOpen) => !isOpen)}
          >
            <TrashIcon size={14} weight="bold" aria-hidden="true" />
          </button>
        </TooltipLabel>
      </div>
      <div
        className={
          isExpanded
            ? 'project-card__disclosure'
            : 'project-card__disclosure project-card__disclosure--collapsed'
        }
        aria-hidden={!isExpanded}
        inert={!isExpanded ? true : undefined}
      >
        <div className="project-card__disclosure-content">
          <div id={workspaceListId} className="workspace-list">
            {workbench.project.workspaces.map((workspace) => {
              const isActiveWorkspace = workspace.isCurrent && isCurrentProject
              const boundBranchName = workspace.gitBranch ?? workspace.displayName
              const isDefaultWorkspace = workspace.workspaceKind === 'default'
              const isGitUninitialized =
                isDefaultWorkspace && !workspace.gitBranch && workbench.gitBranches.length === 0
              const isWorktreeWorkspace = !isDefaultWorkspace && Boolean(workspace.gitBranch)
              const workspaceDisplayName = isGitUninitialized
                ? t('sidebar.gitUninitialized')
                : workspace.displayName
              const shouldShowDefaultWorkspaceBadge =
                isDefaultWorkspace && (!workspace.gitBranch || workspace.gitBranch === 'main')
              const shouldShowGitBranchBadge =
                Boolean(workspace.gitBranch) && workspace.gitBranch !== workspace.displayName
              const workspaceButtonLabel = [
                workspaceDisplayName,
                shouldShowDefaultWorkspaceBadge ? t('sidebar.defaultWorkspace') : null,
                isWorktreeWorkspace ? t('sidebar.separateWorkspace') : null,
                shouldShowGitBranchBadge ? workspace.gitBranch : null
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <div
                  className="workspace-group"
                  key={workspace.workspaceId}
                  ref={isDefaultWorkspace ? branchSelectorRootRef : undefined}
                >
                  {isDefaultWorkspace && workbench.gitBranches.length > 0 ? (
                    <>
                      <div
                        className={
                          isActiveWorkspace
                            ? 'workspace-row workspace-row--active default-branch-selector'
                            : 'workspace-row default-branch-selector'
                        }
                      >
                        <TooltipLabel content={boundBranchName}>
                          <button
                            aria-label={t('sidebar.switchDefaultWorkspace', {
                              branchName: boundBranchName
                            })}
                            aria-current={isActiveWorkspace ? 'page' : undefined}
                            className="default-branch-selector__select"
                            type="button"
                            onClick={() => onSelectWorkspace(workbench, workspace.workspaceId)}
                          >
                            <span className="workspace-row__branch-icon" aria-hidden="true">
                              <GitBranchIcon size={14} />
                            </span>
                            <span className="workspace-row__name truncate">{boundBranchName}</span>
                            {shouldShowDefaultWorkspaceBadge ? (
                              <span className="badge badge--default-workspace">
                                {t('sidebar.defaultWorkspace')}
                              </span>
                            ) : null}
                          </button>
                        </TooltipLabel>
                        <TooltipLabel content={t('sidebar.chooseDefaultBranchTitle')}>
                          <button
                            aria-label={t('sidebar.chooseDefaultBranch', {
                              branchName: boundBranchName
                            })}
                            aria-expanded={isBranchSelectorOpen}
                            aria-haspopup="dialog"
                            className="default-branch-selector__toggle"
                            type="button"
                            onClick={toggleBranchSelector}
                          >
                            <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
                          </button>
                        </TooltipLabel>
                      </div>
                      {isBranchSelectorOpen ? (
                        <BranchSelectorPopover
                          anchorRef={branchSelectorRootRef}
                          branches={workbench.gitBranches}
                          popoverRef={branchSelectorPopoverRef}
                          searchQuery={branchSearchQuery}
                          onSearchQueryChange={setBranchSearchQuery}
                          onChooseBranch={(branch) => {
                            closeBranchSelector()

                            if (branch.isMainWorkspaceBranch) {
                              onSelectWorkspace(workbench, workspace.workspaceId)
                              return
                            }

                            if (branch.isSelectableInMainWorkspace) {
                              onCheckoutMainBranch(workbench, branch.name)
                            }
                          }}
                        />
                      ) : null}
                    </>
                  ) : (
                    <>
                      <div
                        className={[
                          isActiveWorkspace
                            ? 'workspace-row workspace-row--active'
                            : 'workspace-row',
                          isWorktreeWorkspace ? 'workspace-row--with-actions' : null
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <TooltipLabel content={workspaceButtonLabel}>
                          <button
                            aria-label={workspaceButtonLabel}
                            aria-current={isActiveWorkspace ? 'page' : undefined}
                            className="workspace-row__select"
                            type="button"
                            onClick={() => onSelectWorkspace(workbench, workspace.workspaceId)}
                          >
                            <span className="workspace-row__branch-icon" aria-hidden="true">
                              <GitBranchIcon size={14} />
                            </span>
                            <span className="workspace-row__name truncate">
                              {workspaceDisplayName}
                            </span>
                            {shouldShowDefaultWorkspaceBadge ||
                            isWorktreeWorkspace ||
                            shouldShowGitBranchBadge ? (
                              <span className="workspace-row__metadata">
                                {shouldShowDefaultWorkspaceBadge ? (
                                  <span className="badge badge--default-workspace">
                                    {t('sidebar.defaultWorkspace')}
                                  </span>
                                ) : null}
                                {isWorktreeWorkspace ? (
                                  <span className="workspace-row__kind" aria-hidden="true">
                                    <FoldersIcon size={12} />
                                  </span>
                                ) : null}
                                {shouldShowGitBranchBadge ? (
                                  <span className="badge badge--git">{workspace.gitBranch}</span>
                                ) : null}
                              </span>
                            ) : null}
                          </button>
                        </TooltipLabel>
                        {isWorktreeWorkspace ? (
                          <WorkspaceRowMenu
                            isOpen={openWorkspaceMenuId === workspace.workspaceId}
                            workspaceName={workspace.displayName}
                            onArchive={() => setArchiveWorkspaceId(workspace.workspaceId)}
                            onClose={closeWorkspaceMenu}
                            onToggle={() => toggleWorkspaceMenu(workspace.workspaceId)}
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                  {!isDefaultWorkspace && workspace.gitBranch ? (
                    <span className="workspace-git-branch sr-only">{workspace.gitBranch}</span>
                  ) : null}
                </div>
              )
            })}
            {isBranchWorkspaceFormOpen ? (
              <ProjectSidebarBranchWorkspaceForm
                branchName={branchName}
                formRef={formRef}
                projectId={workbench.project.id}
                onBranchNameChange={setBranchName}
                onSubmit={submitBranchWorkspace}
              />
            ) : null}
          </div>
        </div>
      </div>
      {isRemoveProjectDialogOpen ? (
        <ProjectSidebarProjectRemovalPopover
          projectName={workbench.project.name}
          triggerRef={removeProjectButtonRef}
          onCancel={() => setIsRemoveProjectDialogOpen(false)}
          onConfirm={() => {
            setIsRemoveProjectDialogOpen(false)
            onRemoveProject(workbench)
          }}
        />
      ) : null}
      {archiveWorkspace ? (
        <ArchiveWorkspaceDialog
          workspaceName={archiveWorkspace.displayName}
          isCurrentWorkspace={archiveWorkspace.isCurrent && isCurrentProject}
          isLocked={archiveWorkspaceGitBranch?.isLocked ?? false}
          lockReason={archiveWorkspaceGitBranch?.lockReason ?? null}
          onCancel={() => setArchiveWorkspaceId(null)}
          onConfirm={() => {
            onArchiveBranchWorkspace(
              workbench,
              archiveWorkspace.workspaceId,
              archiveWorkspaceGitBranch?.isLocked
                ? { lockReason: archiveWorkspaceGitBranch.lockReason }
                : undefined
            )
            setArchiveWorkspaceId(null)
          }}
        />
      ) : null}
    </section>
  )
}
