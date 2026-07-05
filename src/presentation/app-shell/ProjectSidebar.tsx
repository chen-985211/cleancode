import { GitBranch, Plus, Settings, Sparkles, Trash2 } from 'lucide-react'

import type { WorkbenchSnapshot } from './types'

interface ProjectSidebarProps {
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isDesktopRuntime: boolean
  readonly onAddProject: () => void
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkbench: (workbench: WorkbenchSnapshot) => void
}

export function ProjectSidebar({
  workbenches,
  currentWorkbench,
  isDesktopRuntime,
  onAddProject,
  onRemoveProject,
  onSelectWorkbench
}: ProjectSidebarProps) {
  return (
    <aside className="project-sidebar" aria-label="项目与分支工作区">
      <div className="project-sidebar__brand">
        <span className="brand-mark">
          <Sparkles size={18} aria-hidden="true" />
        </span>
        <span>cleancode</span>
      </div>
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
            onRemoveProject={onRemoveProject}
            onSelectWorkbench={onSelectWorkbench}
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
  readonly onRemoveProject: (workbench: WorkbenchSnapshot) => void
  readonly onSelectWorkbench: (workbench: WorkbenchSnapshot) => void
}

function ProjectCard({
  workbench,
  currentWorkbench,
  onRemoveProject,
  onSelectWorkbench
}: ProjectCardProps) {
  const isCurrentProject = currentWorkbench?.project.id === workbench.project.id

  return (
    <section className="project-card" role="group" aria-label={`项目 ${workbench.project.name}`}>
      <div className="project-card__header">
        <button
          className="project-card__select"
          type="button"
          onClick={() => onSelectWorkbench(workbench)}
        >
          <span className={isCurrentProject ? 'project-dot project-dot--active' : 'project-dot'} />
          <span className="truncate">{workbench.project.name}</span>
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
        {workbench.project.workspaces.map((workspace) => (
          <button
            className={
              workspace.isCurrent && isCurrentProject
                ? 'workspace-row workspace-row--active'
                : 'workspace-row'
            }
            key={workspace.name}
            type="button"
            onClick={() => onSelectWorkbench(workbench)}
          >
            <GitBranch size={14} aria-hidden="true" />
            <span className="truncate">{workspace.name}</span>
            {workspace.isCurrent && isCurrentProject ? <span className="badge">当前</span> : null}
            {workspace.gitBranch ? <span className="badge badge--git">Git</span> : null}
          </button>
        ))}
      </div>
    </section>
  )
}
