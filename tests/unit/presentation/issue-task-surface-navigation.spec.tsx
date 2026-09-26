import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { AppShellProjectArea } from '../../../src/presentation/app-shell/shell/project-sidebar/AppShellProjectArea'
import { useProjectWorkspaceLifecycle } from '../../../src/presentation/app-shell/coordinators/useProjectWorkspaceLifecycle'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'

afterEach(() => {
  delete window.cleancode
})

async function startCreation() {
  const origin = createWorkbenchSnapshot('/one', 'One', { gitBranch: 'main' })
  const other = createWorkbenchSnapshot('/two', 'Two', { gitBranch: 'main' })
  const issue = {
    id: 'I_42',
    repository: 'owner/repo',
    number: 42,
    title: 'Fix resizing',
    url: 'https://github.com/owner/repo/issues/42',
    body: 'Details',
    state: 'OPEN' as const,
    labels: [],
    assignees: []
  }
  const workspace = {
    workspaceId: 'issue-workspace',
    workspaceKind: 'linked-worktree' as const,
    displayName: 'issue/42',
    gitBranch: 'issue/42',
    directory: '/issue',
    isCurrent: true,
    issue
  }
  const created = {
    ...origin,
    project: {
      ...origin.project,
      workspaces: [
        ...origin.project.workspaces.map((item) => ({ ...item, isCurrent: false })),
        workspace
      ]
    },
    graph: { ...origin.graph, workspaceId: workspace.workspaceId },
    initialization: null
  }
  let finish!: () => void
  const start = vi.fn(
    () =>
      new Promise<WorkbenchSnapshot>((resolve) => {
        finish = () => resolve(created)
      })
  )
  const switchWorkspace = vi.fn(async ({ projectDirectory }: { projectDirectory: string }) =>
    projectDirectory === other.project.directory ? other : created
  )
  window.cleancode = {
    listProjectIssues: async () => ({
      repository: { name: 'owner/repo', defaultBranch: 'main' },
      issues: [issue],
      hasMore: false
    }),
    getProjectIssue: async () => issue,
    startIssueWorkspace: start,
    switchBranchWorkspace: switchWorkspace,
    applyWorkspaceInitialization: vi.fn(),
    getWorkspaceDefaults: async () => ({
      defaults: { templates: [], agents: [] },
      removedTemplateIds: []
    }),
    listWorkspaceInitializations: async () => []
  } as unknown as NonNullable<Window['cleancode']>
  const onCanvasPointerDown = vi.fn()
  const nodeStore = createWorkbenchNodeStore()
  function Harness() {
    const [current, setCurrentWorkbench] = useState<WorkbenchSnapshot | null>(origin)
    const [workbenches, setWorkbenches] = useState([origin, other])
    const controller = useProjectWorkspaceLifecycle({
      currentWorkbench: current,
      setCurrentWorkbench,
      setWorkbenches,
      replaceWorkbench: (value) => {
        setCurrentWorkbench(value)
        setWorkbenches((items) =>
          items.map((item) => (item.project.id === value.project.id ? value : item))
        )
      },
      notifications: { notify: vi.fn(() => ''), update: vi.fn(() => false), dismiss: vi.fn() },
      nodeStore,
      protectedNodeIds: new Set(),
      reactFlowInstanceRef: { current: null },
      setHoveredTerminalBlockId: vi.fn(),
      setSelectedTerminalBlockId: vi.fn(),
      terminateWorkspaceTerminalSessions: vi.fn(),
      forgetWorkspaceTerminalStates: vi.fn()
    })
    return (
      <main className="app-shell">
        <section
          className="app-shell__workspace"
          data-testid="canvas"
          onPointerDown={onCanvasPointerDown}
        >
          {current?.project.name}
        </section>
        <AppShellProjectArea
          workbenches={workbenches}
          currentWorkbench={current}
          isDesktopRuntime
          isCollapsed={false}
          toggleRef={{ current: null }}
          motion={{ titlebarRef: { current: null }, sidebarRef: { current: null } }}
          toggleTooltip="Toggle"
          onToggle={vi.fn()}
          onAddProject={vi.fn()}
          onArchiveBranchWorkspace={vi.fn()}
          onCheckoutMainBranch={vi.fn()}
          onCreateBranchWorkspace={vi.fn()}
          onRemoveProject={vi.fn()}
          onReorderProject={vi.fn()}
          onSelectWorkspace={controller.branchWorkspaceActions.selectWorkspace}
          onCreateIssueWorkspace={controller.workspaceInitialization.createIssueWorkspace}
          onProjectChanged={vi.fn()}
        />
      </main>
    )
  }
  render(<Harness />)
  const entry = screen.getByRole('button', { name: '任务' })
  fireEvent.click(entry)
  fireEvent.click(await screen.findByRole('button', { name: issue.title }))
  await screen.findByRole('heading', { name: issue.title })
  fireEvent.click(screen.getByRole('button', { name: '开始处理' }))
  fireEvent.click(screen.getByRole('button', { name: '创建并开始' }))
  await waitFor(() => expect(start).toHaveBeenCalledOnce())
  return { entry, finish, switchWorkspace, onCanvasPointerDown }
}

it('keeps a reopened task surface open after a superseded issue creation completes', async () => {
  const { entry, finish, switchWorkspace } = await startCreation()
  const otherGroup = screen.getByRole('group', { name: /Two/ })
  fireEvent.click(within(otherGroup).getByRole('button', { name: '切换到默认工作区 main' }))
  await waitFor(() => expect(screen.getByTestId('canvas')).toHaveTextContent('Two'))
  expect(entry).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(entry)
  expect(entry).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: '任务项目' })).toHaveTextContent('One')
  await act(async () => finish())
  expect(switchWorkspace).toHaveBeenCalledOnce()
  expect(screen.getByTestId('canvas')).toHaveTextContent('Two')
  expect(entry).toHaveAttribute('aria-expanded', 'true')
})

it.each(['任务项目', '标签'])(
  'closes the %s menu when issue creation opens the workspace',
  async (label) => {
    const { entry, finish, onCanvasPointerDown } = await startCreation()
    if (label === '标签') fireEvent.click(screen.getByRole('button', { name: '返回任务列表' }))
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(screen.getByRole('menu', { name: label })).toBeInTheDocument()
    await act(async () => finish())
    expect(entry).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByTestId('canvas'), { pointerId: 1 })
    expect(onCanvasPointerDown).toHaveBeenCalledOnce()
    fireEvent.click(entry)
    expect(entry).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  }
)
