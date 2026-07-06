import {
  Archive,
  ChevronDown,
  GitBranch,
  MoreHorizontal,
  Plus,
  Settings,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { BranchSelectorPopover } from './ProjectSidebarBranchSelector'
import type { WorkbenchSnapshot } from './types'

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isDesktopRuntime: boolean
  readonly actionError: string | null
  readonly onAddProject: () => void
  readonly onArchiveBranchWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onDismissActionError: () => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
}

export function ProjectSidebar({
  workbenches,
  currentWorkbench,
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
  return (
    <aside className="project-sidebar" aria-label="项目与分支工作区">
      <div className="project-sidebar__actions">
        <button
          className="sidebar-action"
          type="button"
          onClick={onAddProject}
          disabled={!isDesktopRuntime}
        >
          <Plus size={17} aria-hidden="true" />
          添加项目
        </button>
      </div>
      {!isDesktopRuntime ? (
        <div className="runtime-warning" role="status">
          浏览器预览不连接本地文件系统和终端。请用桌面应用运行真实功能。
        </div>
      ) : null}
      {actionError ? (
        <div className="project-sidebar-alert" role="alert">
          <span>{actionError}</span>
          <button
            className="project-sidebar-alert__close"
            type="button"
            aria-label="关闭提示"
            title="关闭提示"
            onClick={onDismissActionError}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="project-sidebar__label">项目</div>
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
      <button
        className="project-sidebar__settings icon-button"
        type="button"
        aria-label="设置"
        title="设置"
      >
        <Settings size={16} aria-hidden="true" />
      </button>
    </aside>
  )
}

interface ProjectCardProps {
  readonly workbench: WorkbenchSnapshot
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly onArchiveBranchWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
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
  const isCurrentProject = currentWorkbench?.project.id === workbench.project.id
  const currentProjectWorkspace = workbench.project.workspaces.find(
    (workspace) => workspace.isCurrent
  )
  const [isCreatingBranchWorkspace, setIsCreatingBranchWorkspace] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false)
  const [branchSearchQuery, setBranchSearchQuery] = useState('')
  const [openWorkspaceMenuName, setOpenWorkspaceMenuName] = useState<string | null>(null)
  const [archiveWorkspaceName, setArchiveWorkspaceName] = useState<string | null>(null)
  const branchSelectorRootRef = useRef<HTMLDivElement>(null)
  const workspaceMenuRootRef = useRef<HTMLDivElement>(null)
  const archiveWorkspace = archiveWorkspaceName
    ? workbench.project.workspaces.find((workspace) => workspace.name === archiveWorkspaceName)
    : null
  const submitBranchWorkspace = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()

    const normalizedBranchName = branchName.trim()

    if (!normalizedBranchName) {
      return
    }

    onCreateBranchWorkspace(workbench, normalizedBranchName)
    setBranchName('')
    setIsCreatingBranchWorkspace(false)
  }
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
    <section className="project-card" role="group" aria-label={`项目 ${workbench.project.name}`}>
      <div className="project-card__header">
        <button
          className="project-card__select"
          type="button"
          onClick={() => onSelectWorkspace(workbench, currentProjectWorkspace?.name ?? 'main')}
        >
          <span className={isCurrentProject ? 'project-dot project-dot--active' : 'project-dot'} />
          <span className="truncate">{workbench.project.name}</span>
        </button>
        <button
          className="project-card__branch icon-button"
          type="button"
          aria-label="新建分支工作区"
          title="新建分支工作区"
          onClick={() => setIsCreatingBranchWorkspace((isCreating) => !isCreating)}
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          className="project-card__remove icon-button"
          type="button"
          aria-label="移除项目"
          title="从列表移除项目"
          onClick={() => onRemoveProject(workbench)}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="workspace-list">
        {workbench.project.workspaces.map((workspace) => {
          const isActiveWorkspace = workspace.isCurrent && isCurrentProject
          const boundBranchName = workspace.gitBranch ?? workspace.name
          const isDefaultWorkspace = workspace.name === 'main'
          const isWorktreeWorkspace = !isDefaultWorkspace && Boolean(workspace.gitBranch)
          const shouldShowDefaultWorkspaceBadge =
            isDefaultWorkspace && (!workspace.gitBranch || workspace.gitBranch === 'main')
          const shouldShowGitBranchBadge =
            Boolean(workspace.gitBranch) && workspace.gitBranch !== workspace.name
          const workspaceButtonLabel = [
            workspace.name,
            shouldShowDefaultWorkspaceBadge ? '默认工作区' : null,
            isWorktreeWorkspace ? 'worktree' : null,
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
                      aria-label={`切换到默认工作区 ${boundBranchName}`}
                      className="default-branch-selector__select"
                      type="button"
                      onClick={() => onSelectWorkspace(workbench, 'main')}
                    >
                      <GitBranch size={14} aria-hidden="true" />
                      <span className="truncate">{boundBranchName}</span>
                      {shouldShowDefaultWorkspaceBadge ? (
                        <span className="badge badge--default-workspace">默认工作区</span>
                      ) : null}
                    </button>
                    <button
                      aria-label={`选择默认工作区分支 ${boundBranchName}`}
                      aria-expanded={isBranchSelectorOpen}
                      aria-haspopup="dialog"
                      className="default-branch-selector__toggle"
                      type="button"
                      title="选择默认工作区分支"
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
                      className="workspace-row__select"
                      type="button"
                      onClick={() => onSelectWorkspace(workbench, workspace.name)}
                    >
                      <GitBranch size={14} aria-hidden="true" />
                      <span className="truncate">{workspace.name}</span>
                      {shouldShowDefaultWorkspaceBadge ? (
                        <span className="badge badge--default-workspace">默认工作区</span>
                      ) : null}
                      {isWorktreeWorkspace ? (
                        <span className="badge badge--worktree">worktree</span>
                      ) : null}
                      {shouldShowGitBranchBadge ? (
                        <span className="badge badge--git">{workspace.gitBranch}</span>
                      ) : null}
                    </button>
                    {isWorktreeWorkspace ? (
                      <button
                        className="workspace-row__menu-button"
                        type="button"
                        aria-label={`打开 ${workspace.name} 工作区菜单`}
                        aria-haspopup="menu"
                        aria-expanded={openWorkspaceMenuName === workspace.name}
                        title="更多"
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
                        归档工作区
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
        {isCreatingBranchWorkspace ? (
          <form className="branch-workspace-form" onSubmit={submitBranchWorkspace}>
            <label className="sr-only" htmlFor={`${workbench.project.id}-branch-name`}>
              分支名称
            </label>
            <input
              id={`${workbench.project.id}-branch-name`}
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="分支名称"
            />
            <button type="submit">创建分支工作区</button>
          </form>
        ) : null}
      </div>
      {archiveWorkspace ? (
        <ArchiveWorkspaceDialog
          workspaceName={archiveWorkspace.name}
          isCurrentWorkspace={archiveWorkspace.isCurrent && isCurrentProject}
          onCancel={() => setArchiveWorkspaceName(null)}
          onConfirm={() => {
            onArchiveBranchWorkspace(workbench, archiveWorkspace.name)
            setArchiveWorkspaceName(null)
          }}
        />
      ) : null}
    </section>
  )
}

interface ArchiveWorkspaceDialogProps {
  readonly workspaceName: string
  readonly isCurrentWorkspace: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}

function ArchiveWorkspaceDialog({
  workspaceName,
  isCurrentWorkspace,
  onCancel,
  onConfirm
}: ArchiveWorkspaceDialogProps) {
  return (
    <div
      className="archive-workspace-dialog"
      role="dialog"
      aria-label={`归档工作区 ${workspaceName}`}
    >
      <div className="archive-workspace-dialog__header">
        <Archive size={16} aria-hidden="true" />
        <span>归档工作区 {workspaceName}</span>
      </div>
      <p>
        将移除这个 worktree 目录，但保留 Git 分支 {workspaceName}。之后可以从默认工作区重新创建。
      </p>
      {isCurrentWorkspace ? <p>当前正在使用该工作区，归档前将自动切回默认工作区。</p> : null}
      <div className="archive-workspace-dialog__actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button className="archive-workspace-dialog__confirm" type="button" onClick={onConfirm}>
          归档工作区
        </button>
      </div>
    </div>
  )
}
