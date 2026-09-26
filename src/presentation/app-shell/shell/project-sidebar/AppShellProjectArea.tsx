import { useRef, useState, type ComponentProps } from 'react'
import { ListChecksIcon } from '@phosphor-icons/react/dist/csr/ListChecks'
import { AppShellSidebar } from './AppShellSidebar'
import { IssueMenuSelect } from '../../../../contexts/project/presentation/components/IssueMenuSelect'
import { ProjectIssuesPanel } from '../../../../contexts/project/presentation/components/ProjectIssuesPanel'
import type { StartIssueWorkspaceCommand } from '../../../../contexts/project/application/dto/ProjectIssues'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'
import type { ProjectSnapshot } from '../../../../contexts/project/application/dto/ProjectSnapshot'
import { useI18n } from '../../../i18n/useI18n'
import { useInterruptibleSurfaceFocusRestore } from '../../../shared/hooks/useInterruptibleSurfaceFocusRestore'
import { TaskSurface } from './TaskSurface'

export function AppShellProjectArea({
  onCreateIssueWorkspace,
  onProjectChanged,
  ...props
}: ComponentProps<typeof AppShellSidebar> & {
  readonly onCreateIssueWorkspace: (
    workbench: WorkbenchSnapshot,
    command: StartIssueWorkspaceCommand
  ) => Promise<boolean>
  readonly onProjectChanged: (project: ProjectSnapshot) => void
}) {
  const { t } = useI18n()
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const focus = useInterruptibleSurfaceFocusRestore(surfaceRef, triggerRef)
  const selected =
    props.workbenches.find((item) => item.project.id === taskProjectId) ??
    props.currentWorkbench ??
    props.workbenches[0]
  const workbench =
    selected?.project.id === props.currentWorkbench?.project.id ? props.currentWorkbench : selected
  const close = () => {
    focus.beginFocusRestore()
    setOpen(false)
  }
  return (
    <div className="task-navigation-owner" data-shortcut-capture={open ? '' : undefined}>
      <AppShellSidebar
        {...props}
        onSelectWorkspace={(...args) => {
          focus.cancelFocusRestore()
          setOpen(false)
          props.onSelectWorkspace(...args)
        }}
        navigation={
          props.isDesktopRuntime ? (
            <button
              ref={triggerRef}
              type="button"
              className="project-sidebar__task-navigation"
              aria-expanded={open}
              aria-controls="project-issues-panel"
              disabled={!workbench}
              onClick={() => {
                if (open) {
                  close()
                  return
                }
                focus.cancelFocusRestore()
                if (workbench) setTaskProjectId(workbench.project.id)
                setOpen(true)
              }}
            >
              <ListChecksIcon size={17} aria-hidden="true" />
              <span>{t('tasks.title')}</span>
            </button>
          ) : undefined
        }
      />
      {workbench && taskProjectId !== null ? (
        <TaskSurface
          open={open}
          surfaceRef={surfaceRef}
          onExitComplete={focus.completeFocusRestore}
        >
          <ProjectIssuesPanel
            project={workbench.project}
            title={t('tasks.title')}
            projectSelector={
              <IssueMenuSelect
                label={t('tasks.project')}
                value={workbench.project.id}
                options={props.workbenches.map((item) => ({
                  value: item.project.id,
                  label: item.project.name
                }))}
                onChange={setTaskProjectId}
              />
            }
            open={open}
            onClose={close}
            onWorkspaceStarted={() => {
              focus.cancelFocusRestore()
              setOpen(false)
            }}
            onStart={(command) => onCreateIssueWorkspace(workbench, command)}
            onOpenWorkspace={(id) => {
              focus.cancelFocusRestore()
              props.onSelectWorkspace(workbench, id)
              setOpen(false)
            }}
            onProjectChanged={onProjectChanged}
          />
        </TaskSurface>
      ) : null}
    </div>
  )
}
