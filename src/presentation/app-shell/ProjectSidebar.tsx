import { Check, ChevronDown, GitBranch, Plus, Search, Settings, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { WorkbenchSnapshot } from './types'

type GitBranchNavigationItem = WorkbenchSnapshot['gitBranches'][number]

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isDesktopRuntime: boolean
  readonly onAddProject: () => void
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
}

export function ProjectSidebar({
  workbenches,
  currentWorkbench,
  isDesktopRuntime,
  onAddProject,
  onCheckoutMainBranch,
  onCreateBranchWorkspace,
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
      <div className="project-sidebar__label">项目</div>
      <div className="project-list">
        {workbenches.map((workbench) => (
          <ProjectCard
            key={workbench.project.id}
            workbench={workbench}
            currentWorkbench={currentWorkbench}
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
  readonly onCheckoutMainBranch: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onCreateBranchWorkspace: (workbench: WorkbenchSnapshot, branchName: string) => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkspace: (workbench: WorkbenchSnapshot, workspaceName: string) => void
}

function ProjectCard({
  workbench,
  currentWorkbench,
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
  const branchSelectorRootRef = useRef<HTMLDivElement>(null)
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
              ref={workspace.name === 'main' ? branchSelectorRootRef : undefined}
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
                <button
                  aria-label={workspaceButtonLabel}
                  className={
                    isActiveWorkspace ? 'workspace-row workspace-row--active' : 'workspace-row'
                  }
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
    </section>
  )
}

interface BranchSelectorPopoverProps {
  readonly branches: readonly GitBranchNavigationItem[]
  readonly searchQuery: string
  readonly onSearchQueryChange: (query: string) => void
  readonly onChooseBranch: (branch: GitBranchNavigationItem) => void
}

function BranchSelectorPopover({
  branches,
  searchQuery,
  onSearchQueryChange,
  onChooseBranch
}: BranchSelectorPopoverProps) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const visibleBranches = normalizedQuery
    ? branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalizedQuery))
    : branches
  const orderedVisibleBranches = orderBranchSelectorItems(visibleBranches)

  return (
    <div className="branch-selector-popover" role="dialog" aria-label="选择默认工作区分支">
      <label className="sr-only" htmlFor="branch-selector-search">
        搜索分支
      </label>
      <div className="branch-selector-search">
        <Search size={15} aria-hidden="true" />
        <input
          id="branch-selector-search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜索分支"
        />
      </div>
      <div className="branch-selector-label">分支</div>
      <div className="branch-selector-options">
        {orderedVisibleBranches.map((branch) => {
          const isWorktreeBranch = Boolean(
            branch.worktreeDirectory && !branch.isMainWorkspaceBranch
          )
          const isDisabled = !branch.isSelectableInMainWorkspace && !branch.isMainWorkspaceBranch

          return (
            <button
              className={
                branch.isMainWorkspaceBranch
                  ? 'branch-selector-option branch-selector-option--current'
                  : 'branch-selector-option'
              }
              key={branch.name}
              type="button"
              disabled={isDisabled}
              onClick={() => onChooseBranch(branch)}
            >
              <GitBranch size={15} aria-hidden="true" />
              <span className="branch-selector-option__content">
                <span className="truncate">{branch.name}</span>
                {isWorktreeBranch ? (
                  <span className="branch-selector-option__meta">独立工作区</span>
                ) : null}
              </span>
              {branch.isMainWorkspaceBranch ? <Check size={17} aria-hidden="true" /> : null}
            </button>
          )
        })}
        {visibleBranches.length === 0 ? (
          <div className="branch-selector-empty" role="status">
            没有匹配的分支
          </div>
        ) : null}
      </div>
      <button className="branch-selector-create" type="button" disabled>
        <Plus size={16} aria-hidden="true" />
        创建并检出新分支...
      </button>
    </div>
  )
}

function orderBranchSelectorItems(
  branches: readonly GitBranchNavigationItem[]
): GitBranchNavigationItem[] {
  return [...branches].sort(
    (leftBranch, rightBranch) =>
      getBranchSelectorPriority(leftBranch) - getBranchSelectorPriority(rightBranch)
  )
}

function getBranchSelectorPriority(branch: GitBranchNavigationItem): number {
  if (branch.name === 'main') {
    return 0
  }

  if (branch.isMainWorkspaceBranch) {
    return 1
  }

  return 2
}
