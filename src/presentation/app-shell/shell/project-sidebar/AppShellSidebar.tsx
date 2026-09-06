import type { ComponentProps, Ref } from 'react'
import { ProjectSidebar } from '../../../../contexts/project/presentation/components/ProjectSidebar'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'
import { ProjectSidebarToggle } from './ProjectSidebarToggle'

interface AppShellSidebarProps extends Omit<
  ComponentProps<typeof ProjectSidebar<WorkbenchSnapshot>>,
  'motionSurfaceRef'
> {
  readonly isCollapsed: boolean
  readonly toggleRef: Ref<HTMLButtonElement>
  readonly motion: {
    readonly titlebarRef: Ref<HTMLDivElement>
    readonly sidebarRef: Ref<HTMLDivElement>
  }
  readonly toggleTooltip: string
  readonly onToggle: () => void
}

export function AppShellSidebar({
  toggleRef,
  motion,
  toggleTooltip,
  onToggle,
  ...sidebar
}: AppShellSidebarProps) {
  return (
    <div className="project-sidebar-column">
      <ProjectSidebarToggle
        buttonRef={toggleRef}
        isCollapsed={sidebar.isCollapsed}
        motionSurfaceRef={motion.titlebarRef}
        shortcutTooltip={toggleTooltip}
        onToggle={onToggle}
      />
      <ProjectSidebar {...sidebar} motionSurfaceRef={motion.sidebarRef} />
    </div>
  )
}
