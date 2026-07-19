import {
  Archive,
  ChevronDown,
  Folders,
  GitBranch,
  MoreHorizontal,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { BranchSelectorPopover } from './ProjectSidebarBranchSelector'
import { ArchiveWorkspaceDialog } from './ArchiveWorkspaceDialog'
import { ProjectSidebarBranchWorkspaceForm } from './ProjectSidebarBranchWorkspaceForm'
import { ProjectSidebarProjectRemovalPopover } from './ProjectSidebarProjectRemovalPopover'
import type { WorkbenchSnapshot } from './types'
import { useProjectSidebarBranchWorkspaceForm } from './useProjectSidebarBranchWorkspaceForm'
import { useI18n } from './i18n/useI18n'

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isCollapsed?: boolean
  readonly isDesktopRuntime: boolean
  readonly actionError: string | null
  readonly onAddProject: () => void
  readonly onArchiveBranchWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceName: string,
    lockedWorktreeConfirmation?: { readonly lockReason: string | null }
  ) => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onDismissActionError: () => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
}

export function ProjectSidebar({
  workbenches,
  currentWorkbench,
  isCollapsed = false,
  isDesktopRuntime,
  actionError,
  onAddProject,
  onArchiveBranchWorkspace,
  onCheckoutMainBranch,
  onCreateBranchWorkspace,
  onDismissActionError,
  onRemoveProject,
  onSelectWorkspace
}: ProjectSidebarProps) {
  const { t } = useI18n()
  return (
    <aside
      id="project-sidebar"
      className="project-sidebar"
      aria-hidden={isCollapsed || undefined}
      aria-label={t('sidebar.label')}
      inert={isCollapsed}
    >
      <div className="project-sidebar__actions">
        <button
          className="sidebar-action"
          type="button"
          onClick={onAddProject}
          disabled={!isDesktopRuntime}
        >
          <Plus size={17} aria-hidden="true" />
          {t('sidebar.addProject')}
        </button>
      </div>
      {!isDesktopRuntime ? (
        <div className="runtime-warning" role="status">
          {t('sidebar.previewWarning')}
        </div>
      ) : null}
      {actionError ? (
        <div className="project-sidebar-alert" role="alert">
          <span>{actionError}</span>
          <button
            className="project-sidebar-alert__close"
            type="button"
            aria-label={t('sidebar.closeAlert')}
            title={t('sidebar.closeAlert')}
            onClick={onDismissActionError}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="project-sidebar__label">{t('sidebar.projects')}</div>
      <div className="project-list">
        {workbenches.map((workbench) => (
          <ProjectCard
            key={workbench.project.id}
            workbench={workbench}
            currentWorkbench={currentWorkbench}
            onArchiveBranchWorkspace={onArchiveBranchWorkspace}
            onCheckoutMainBranch={onCheckoutMainBranch}
            onCreateBranchWorkspace={onCreateBranchWorkspace}
            onRemoveProject={onRemoveProject}
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
    workspaceName: string,
    lockedWorktreeConfirmation?: { readonly lockReason: string | null }
  ) => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
}

function ProjectCard({
  workbench,
  currentWorkbench,
  onArchiveBranchWorkspace,
  onCheckoutMainBranch,
  onCreateBranchWorkspace,
  onRemoveProject,
  onSelectWorkspace
}: ProjectCardProps) {
  const { t } = useI18n()
  const isCurrentProject = currentWorkbench?.project.id === workbench.project.id
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [branchSearchQuery, setBranchSearchQuery] = useState('')
  const [openWorkspaceMenuName, setOpenWorkspaceMenuName] = useState<string | null>(null)
  const [archiveWorkspaceName, setArchiveWorkspaceName] = useState<string | null>(null)
  const [isRemoveProjectDialogOpen, setIsRemoveProjectDialogOpen] = useState(false)
  const branchSelectorRootRef = useRef<HTMLDivElement>(null)
  const removeProjectButtonRef = useRef<HTMLButtonElement>(null)
  const workspaceMenuRootRef = useRef<HTMLDivElement>(null)
  const {
    branchName,
    close: closeBranchWorkspaceForm,
    formRef,
    isOpen: isBranchWorkspaceFormOpen,
    setBranchName,
    submit: submitBranchWorkspace,
    toggle: toggleBranchWorkspaceForm,
    triggerRef
  } = useProjectSidebarBranchWorkspaceForm((newBranchName) =>
    onCreateBranchWorkspace(workbench, newBranchName)
  )
  const archiveWorkspace = archiveWorkspaceName
    ? workbench.project.workspaces.find((workspace) => workspace.name === archiveWorkspaceName)
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
      setOpenWorkspaceMenuName(null)
    }

    setIsExpanded((expanded) => !expanded)
  }
  const workspaceListId = `project-${workbench.project.id}-workspaces`

  useEffect(() => {
    if (!isBranchSelectorOpen) {
      return undefined
    }

    const closeBranchSelectorWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (target instanceof Node && branchSelectorRootRef.current?.contains(target)) {
        return
      }

      closeBranchSelector()
    }

    document.addEventListener('pointerdown', closeBranchSelectorWhenClickingOutside)

    return () => {
      document.removeEventListener('pointerdown', closeBranchSelectorWhenClickingOutside)
    }
  }, [isBranchSelectorOpen])

  useEffect(() => {
    if (!openWorkspaceMenuName) {
      return undefined
    }

    const closeWorkspaceMenuWhenClickingOutside = (event: PointerEvent): void => {
      const target = event.target

      if (target instanceof Node && workspaceMenuRootRef.current?.contains(target)) {
        return
      }

      setOpenWorkspaceMenuName(null)
    }

    document.addEventListener('pointerdown', closeWorkspaceMenuWhenClickingOutside)

    return () => {
      document.removeEventListener('pointerdown', closeWorkspaceMenuWhenClickingOutside)
    }
  }, [openWorkspaceMenuName])

  return (
    <section
      className="project-card"
      role="group"
      aria-label={t('sidebar.projectGroup', { projectName: workbench.project.name })}
    >
      <div className="project-card__header">
        <button
          className="project-card__select"
          type="button"
          aria-controls={workspaceListId}
          aria-expanded={isExpanded}
          aria-label={workbench.project.name}
          title={t(isExpanded ? 'sidebar.collapseProject' : 'sidebar.expandProject', {
            projectName: workbench.project.name
          })}
          onClick={toggleProjectExpanded}
        >
          <span className={isCurrentProject ? 'project-dot project-dot--active' : 'project-dot'} />
          <span className="project-card__name truncate">{workbench.project.name}</span>
        </button>
        <button
          className="project-card__branch icon-button"
          type="button"
          aria-label={t('sidebar.newBranchWorkspace')}
          title={t('sidebar.newBranchWorkspace')}
          ref={triggerRef}
          onClick={toggleBranchWorkspaceForm}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          className="project-card__remove icon-button"
          type="button"
          aria-label={t('sidebar.removeProject')}
          title={t('sidebar.removeProjectFromList')}
          ref={removeProjectButtonRef}
          onClick={() => setIsRemoveProjectDialogOpen((isOpen) => !isOpen)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      {isExpanded ? (
        <div id={workspaceListId} className="workspace-list">
          {workbench.project.workspaces.map((workspace) => {
            const isActiveWorkspace = workspace.isCurrent && isCurrentProject
            const boundBranchName = workspace.gitBranch ?? workspace.name
            const isDefaultWorkspace = workspace.name === 'main'
            const isGitUninitialized =
              isDefaultWorkspace && !workspace.gitBranch && workbench.gitBranches.length === 0
            const isWorktreeWorkspace = !isDefaultWorkspace && Boolean(workspace.gitBranch)
            const workspaceDisplayName = isGitUninitialized
              ? t('sidebar.gitUninitialized')
              : workspace.name
            const shouldShowDefaultWorkspaceBadge =
              isDefaultWorkspace && (!workspace.gitBranch || workspace.gitBranch === 'main')
            const shouldShowGitBranchBadge =
              Boolean(workspace.gitBranch) && workspace.gitBranch !== workspace.name
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
                key={workspace.name}
                ref={
                  workspace.name === 'main'
                    ? branchSelectorRootRef
                    : openWorkspaceMenuName === workspace.name
                      ? workspaceMenuRootRef
                      : undefined
                }
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
                      <button
                        aria-label={t('sidebar.switchDefaultWorkspace', {
                          branchName: boundBranchName
                        })}
                        aria-current={isActiveWorkspace ? 'page' : undefined}
                        className="default-branch-selector__select"
                        type="button"
                        title={boundBranchName}
                        onClick={() => onSelectWorkspace(workbench, 'main')}
                      >
                        <span className="workspace-row__branch-icon" aria-hidden="true">
                          <GitBranch size={14} />
                        </span>
                        <span className="workspace-row__name truncate">{boundBranchName}</span>
                        {shouldShowDefaultWorkspaceBadge ? (
                          <span className="badge badge--default-workspace">
                            {t('sidebar.defaultWorkspace')}
                          </span>
                        ) : null}
                      </button>
                      <button
                        aria-label={t('sidebar.chooseDefaultBranch', {
                          branchName: boundBranchName
                        })}
                        aria-expanded={isBranchSelectorOpen}
                        aria-haspopup="dialog"
                        className="default-branch-selector__toggle"
                        type="button"
                        title={t('sidebar.chooseDefaultBranchTitle')}
                        onClick={toggleBranchSelector}
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                    {isBranchSelectorOpen ? (
                      <BranchSelectorPopover
                        branches={workbench.gitBranches}
                        searchQuery={branchSearchQuery}
                        onSearchQueryChange={setBranchSearchQuery}
                        onChooseBranch={(branch) => {
                          closeBranchSelector()

                          if (branch.isMainWorkspaceBranch) {
                            onSelectWorkspace(workbench, 'main')
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
                        isActiveWorkspace ? 'workspace-row workspace-row--active' : 'workspace-row',
                        isWorktreeWorkspace ? 'workspace-row--with-actions' : null
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button
                        aria-label={workspaceButtonLabel}
                        aria-current={isActiveWorkspace ? 'page' : undefined}
                        className="workspace-row__select"
                        type="button"
                        title={workspaceDisplayName}
                        onClick={() => onSelectWorkspace(workbench, workspace.name)}
                      >
                        <span className="workspace-row__branch-icon" aria-hidden="true">
                          <GitBranch size={14} />
                        </span>
                        <span className="workspace-row__name truncate">{workspaceDisplayName}</span>
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
                              <span
                                className="workspace-row__kind"
                                aria-hidden="true"
                                title={t('sidebar.separateWorkspace')}
                              >
                                <Folders size={12} />
                              </span>
                            ) : null}
                            {shouldShowGitBranchBadge ? (
                              <span className="badge badge--git">{workspace.gitBranch}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </button>
                      {isWorktreeWorkspace ? (
                        <button
                          className="workspace-row__menu-button"
                          type="button"
                          aria-label={t('sidebar.openWorkspaceMenu', {
                            workspaceName: workspace.name
                          })}
                          aria-haspopup="menu"
                          aria-expanded={openWorkspaceMenuName === workspace.name}
                          title={t('sidebar.more')}
                          onClick={() =>
                            setOpenWorkspaceMenuName((menuName) =>
                              menuName === workspace.name ? null : workspace.name
                            )
                          }
                        >
                          <MoreHorizontal size={15} aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    {openWorkspaceMenuName === workspace.name ? (
                      <div className="workspace-row-menu" role="menu">
                        <button
                          className="workspace-row-menu__item workspace-row-menu__item--danger"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setArchiveWorkspaceName(workspace.name)
                            setOpenWorkspaceMenuName(null)
                          }}
                        >
                          <Archive size={14} aria-hidden="true" />
                          {t('sidebar.archiveWorkspace')}
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
                {workspace.name !== 'main' && workspace.gitBranch ? (
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
      ) : null}
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
          workspaceName={archiveWorkspace.name}
          isCurrentWorkspace={archiveWorkspace.isCurrent && isCurrentProject}
          isLocked={archiveWorkspaceGitBranch?.isLocked ?? false}
          lockReason={archiveWorkspaceGitBranch?.lockReason ?? null}
          onCancel={() => setArchiveWorkspaceName(null)}
          onConfirm={() => {
            onArchiveBranchWorkspace(
              workbench,
              archiveWorkspace.name,
              archiveWorkspaceGitBranch?.isLocked
                ? { lockReason: archiveWorkspaceGitBranch.lockReason }
                : undefined
            )
            setArchiveWorkspaceName(null)
          }}
        />
      ) : null}
    </section>
  )
}
