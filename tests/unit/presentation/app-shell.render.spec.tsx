import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { shortcutBindingsStorageKey } from '../../../src/presentation/app-shell/applicationShortcutPreference'

describe('app shell', () => {
  beforeEach(() => {
    window.localStorage.removeItem(shortcutBindingsStorageKey)
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel'
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('does not pretend browser preview data is a real workbench', async () => {
    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))
    const appSettings = screen.getByRole('group', { name: '应用设置' })

    expect(screen.getByRole('main', { name: 'cleancode 工作区' })).toBeInTheDocument()
    expect(screen.queryByText('cleancode')).not.toBeInTheDocument()
    const languageSettingsTrigger = screen.getByRole('button', { name: '语言' })
    const themeSettingsTrigger = screen.getByRole('button', { name: '主题设置' })
    const applicationSettingsTrigger = screen.getByRole('button', { name: '设置' })
    expect(appSettings).toContainElement(languageSettingsTrigger)
    expect(appSettings).toContainElement(themeSettingsTrigger)
    expect(appSettings).toContainElement(applicationSettingsTrigger)
    expect(languageSettingsTrigger.parentElement?.nextElementSibling).toBe(themeSettingsTrigger)
    expect(themeSettingsTrigger.nextElementSibling).toBe(applicationSettingsTrigger)
    expect(languageSettingsTrigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(themeSettingsTrigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(themeSettingsTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(applicationSettingsTrigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(applicationSettingsTrigger).toHaveAttribute('aria-expanded', 'false')
    expect(toolbar.queryByRole('button', { name: '主题设置' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开项目' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目' })).toBeDisabled()
    expect(toolbar.getAllByRole('button')).toHaveLength(3)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '新建 Agent' })).toBeDisabled()
    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '组合终端' })).toBeDisabled()
    expect(screen.getByLabelText('积木画布')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '积木导航小地图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起小地图' })).toBeInTheDocument()
    expect(screen.queryByText('小地图')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Agent 面板' })).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('积木画布').querySelector('[data-agent-console-node]')
    ).toBeInTheDocument()
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument()
    expect(screen.getByText('桌面运行时未连接')).toBeInTheDocument()
    expect(screen.queryByText('未接入')).not.toBeInTheDocument()
    expect(screen.getByText('浏览器预览模式')).toBeInTheDocument()
    expect(screen.queryByText('cleancode-demo')).not.toBeInTheDocument()
    expect(screen.queryByText('Terminal')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspace ready')).not.toBeInTheDocument()
    expect(screen.queryByText('文件树')).not.toBeInTheDocument()
    expect(screen.queryByText('默认工作区')).not.toBeInTheDocument()
    expect(screen.queryByText('添加数据库终端')).not.toBeInTheDocument()
    expect(screen.queryByText('添加测试终端')).not.toBeInTheDocument()
    expect(screen.queryByText('本地 Agent 入口已预留。')).not.toBeInTheDocument()
    expect(screen.queryByText('Codex')).not.toBeInTheDocument()
    expect(screen.queryByText('待接入')).not.toBeInTheDocument()
    expect(screen.queryByText('React Flow')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('积木画布').querySelector('.react-flow__controls')
    ).not.toBeInTheDocument()
  })

  it('enables project actions only when the desktop runtime API exists', () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        appName: 'cleancode',
        listWorkbenches: vi.fn(async () => []),
        addProject: vi.fn(),
        removeProject: vi.fn(),
        createTerminalBlock: vi.fn(),
        createTerminalGroup: vi.fn(),
        updateTerminalBlockMetadata: vi.fn(),
        updateTerminalGroupMetadata: vi.fn(),
        setTerminalGroupCollapsed: vi.fn(),
        addTerminalToGroup: vi.fn(),
        removeTerminalFromGroup: vi.fn(),
        dissolveTerminalGroup: vi.fn(),
        resizeTerminalBlock: vi.fn(),
        updateGraphViewport: vi.fn(),
        moveBlock: vi.fn(),
        moveTerminalGroup: vi.fn(),
        deleteBlock: vi.fn(),
        startTerminal: vi.fn(),
        writeTerminal: vi.fn(),
        resizeTerminal: vi.fn(),
        interruptTerminal: vi.fn(),
        terminateTerminal: vi.fn(),
        onTerminalOutput: vi.fn(() => vi.fn()),
        onTerminalExit: vi.fn(() => vi.fn())
      }
    })

    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    expect(screen.queryByRole('button', { name: '打开项目' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目' })).toBeEnabled()
    expect(toolbar.getAllByRole('button')).toHaveLength(3)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '新建 Agent' })).toBeDisabled()
    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '组合终端' })).toBeDisabled()
    expect(screen.queryByText('浏览器预览模式')).not.toBeInTheDocument()
  })

  it('allows entering terminal group editing whenever a workbench is open', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    fireEvent.click(await toolbar.findByRole('button', { name: '组合终端' }))

    expect(toolbar.getByText('组合编辑')).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '创建组合' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '完成' })).toBeEnabled()
  })

  it('opens the full application settings surface from the default shortcut', () => {
    render(<AppShell />)
    const workspace = screen.getByLabelText('积木画布')

    fireEvent.keyDown(document, { key: ',', metaKey: true })
    fireEvent.keyDown(document, { ctrlKey: true, key: ',' })

    expect(screen.getByRole('dialog', { name: '设置' })).toBeInTheDocument()
    expect(workspace).toBeInTheDocument()
    expect(workspace.inert).toBe(true)
  })

  it('collapses the project sidebar without remounting the canvas workspace', () => {
    render(<AppShell />)
    const workspace = screen.getByLabelText('积木画布')
    const sidebar = screen.getByLabelText('项目与分支工作区')
    const titlebarNavigation = screen.getByRole('navigation', { name: '窗口导航' })
    const collapseSidebar = within(titlebarNavigation).getByRole('button', {
      name: '收起侧边栏'
    })
    const sidebarColumn = sidebar.closest('.project-sidebar-column')

    expect(sidebarColumn).not.toBeNull()
    expect(titlebarNavigation.parentElement).toBe(sidebarColumn)
    expect(sidebar.previousElementSibling).toBe(titlebarNavigation)
    expect(
      titlebarNavigation.querySelector('.app-shell__titlebar-traffic-light-pad')
    ).toBeInTheDocument()
    expect(collapseSidebar).toHaveAttribute('aria-expanded', 'true')
    expect(collapseSidebar.querySelector('.lucide-panel-left')).toBeInTheDocument()
    expect(sidebar).not.toHaveAttribute('aria-hidden')

    fireEvent.click(collapseSidebar)

    expect(screen.getByLabelText('积木画布')).toBe(workspace)
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    const expandSidebar = within(titlebarNavigation).getByRole('button', {
      name: '展开侧边栏'
    })
    expect(titlebarNavigation.parentElement).toBe(sidebarColumn)
    expect(expandSidebar).toHaveAttribute('aria-expanded', 'false')
    expect(expandSidebar.querySelector('.lucide-panel-left')).toBeInTheDocument()

    fireEvent.click(expandSidebar)

    expect(screen.getByLabelText('积木画布')).toBe(workspace)
    expect(sidebar).not.toHaveAttribute('aria-hidden')
  })

  it('shows the sidebar shortcut in an Orca-style bottom tooltip', async () => {
    render(<AppShell />)
    const titlebarNavigation = screen.getByRole('navigation', { name: '窗口导航' })
    const toggle = within(titlebarNavigation).getByRole('button', { name: '收起侧边栏' })

    fireEvent.pointerMove(toggle, { pointerType: 'mouse' })

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(/切换侧边栏 \((?:⌘B|Ctrl\+B)\)/)
    expect(document.querySelector('.cc-tooltip-content')).toHaveAttribute('data-side', 'bottom')
  })

  it('updates a toolbar tooltip immediately after editing its shortcut', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ listWorkbenches: vi.fn(async () => [workbench]) })
    })
    render(<AppShell />)
    await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    const recorder = screen.getByRole('button', { name: '修改“新建终端积木”快捷键' })
    fireEvent.click(recorder)
    fireEvent.keyDown(recorder, { altKey: true, key: 'k', metaKey: true })
    fireEvent.click(screen.getByRole('button', { name: '返回工作区' }))

    const createTerminal = screen.getByRole('button', { name: '新建终端积木' })
    fireEvent.pointerMove(createTerminal, { pointerType: 'mouse' })

    expect(await screen.findByRole('tooltip')).toHaveTextContent('新建终端积木 (⌘⌥K)')
  })

  it('routes Command/Ctrl+B through the sidebar toggle action', () => {
    render(<AppShell />)

    fireEvent.keyDown(document, { key: 'b', metaKey: true })
    fireEvent.keyDown(document, { ctrlKey: true, key: 'b' })

    expect(screen.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )

    fireEvent.keyDown(document, { key: 'b', metaKey: true })
    fireEvent.keyDown(document, { ctrlKey: true, key: 'b' })

    expect(screen.getByRole('button', { name: '收起侧边栏' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('routes the terminal shortcut through the existing workbench action', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const createTerminalBlock = vi.fn()
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        createTerminalBlock,
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.keyDown(document, { key: 't', metaKey: true })
    fireEvent.keyDown(document, { ctrlKey: true, key: 't' })

    expect(createTerminalBlock).toHaveBeenCalledTimes(1)
    expect(createTerminalBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Terminal 1',
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'main'
      })
    )
  })

  it('restores the workbench marked as the current project', async () => {
    const alpha = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const beta = {
      ...createWorkbenchSnapshot('/tmp/beta-project', 'beta-project'),
      isCurrentProject: true
    }

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [alpha, beta])
      })
    })

    render(<AppShell />)

    const alphaProject = await screen.findByRole('group', { name: '项目 alpha-project' })
    const betaProject = screen.getByRole('group', { name: '项目 beta-project' })
    const alphaWorkspace = within(alphaProject).getByRole('button', {
      name: 'Git 未初始化 默认工作区'
    })
    const betaWorkspace = within(betaProject).getByRole('button', {
      name: 'Git 未初始化 默认工作区'
    })

    await waitFor(() => expect(betaWorkspace).toHaveAttribute('aria-current', 'page'))
    expect(alphaWorkspace).not.toHaveAttribute('aria-current')
  })

  it('switches branch workspaces through the desktop runtime API', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/sidebar',
          directory: '/tmp/alpha-project-worktrees/feature-sidebar',
          gitBranch: 'feature/sidebar',
          isCurrent: false
        }
      ]
    })
    const switchedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaceName: 'feature/sidebar',
      workspaceDirectory: '/tmp/alpha-project-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: 'feature/sidebar 独立工作区' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'feature/sidebar'
      })
    )
    await screen.findByText('/tmp/alpha-project-worktrees/feature-sidebar')
  })

  it('shows the bound branch as a default-workspace selector instead of listing every branch', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: true
        },
        {
          name: 'feature/worktree',
          directory: '/tmp/alpha-project-worktrees/feature-worktree',
          gitBranch: 'feature/worktree',
          isCurrent: false
        }
      ],
      gitBranches: [
        {
          name: 'feature/free',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/worktree',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/feature-worktree',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByRole('button', { name: '切换到默认工作区 main' })).toBeEnabled()
    expect(
      within(projectCard).getByRole('button', { name: '选择默认工作区分支 main' })
    ).toBeEnabled()
    expect(within(projectCard).getByText('默认工作区')).toBeInTheDocument()
    expect(within(projectCard).queryByRole('button', { name: /feature\/free/ })).toBeNull()
    const worktreeWorkspaceButton = within(projectCard).getByRole('button', {
      name: 'feature/worktree 独立工作区'
    })

    expect(worktreeWorkspaceButton).toBeEnabled()
    expect(worktreeWorkspaceButton).toHaveAccessibleName('feature/worktree 独立工作区')
    const worktreeIndicator =
      worktreeWorkspaceButton.querySelector<HTMLElement>('.workspace-row__kind')!

    expect(worktreeIndicator).toBeInTheDocument()
    expect(worktreeIndicator).toHaveAttribute('aria-hidden', 'true')
    expect(worktreeIndicator.querySelector('.lucide-folders')).toBeInTheDocument()
    expect(within(worktreeWorkspaceButton).queryByText('worktree')).not.toBeInTheDocument()

    fireEvent.click(within(projectCard).getByRole('button', { name: '选择默认工作区分支 main' }))

    const branchDialog = await screen.findByRole('dialog', { name: '选择默认工作区分支' })
    const branchOptionButtons = within(branchDialog).getAllByRole('button')

    expect(within(branchDialog).getByPlaceholderText('搜索分支')).toBeInTheDocument()
    expect(branchOptionButtons[0]).toHaveAccessibleName('main')
    expect(within(branchDialog).getByRole('button', { name: /feature\/free/ })).toBeEnabled()
    expect(
      within(branchDialog).getByRole('button', { name: /feature\/worktree.*独立工作区/ })
    ).toBeDisabled()

    fireEvent.pointerDown(document.body)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).not.toBeInTheDocument()
    )
  })

  it('switches to main when clicking the default workspace row body', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaceName: 'test',
      workspaceDirectory: '/tmp/alpha-project-worktrees/test',
      gitBranch: 'test',
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          name: 'test',
          directory: '/tmp/alpha-project-worktrees/test',
          gitBranch: 'test',
          isCurrent: true
        }
      ],
      gitBranches: [
        {
          name: 'main',
          isCurrent: false,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'test',
          isCurrent: true,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/test',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const switchedWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'main'
    })
    const switchBranchWorkspace = vi.fn(async () => switchedWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '切换到默认工作区 main' }))

    await waitFor(() =>
      expect(switchBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        workspaceName: 'main'
      })
    )
    expect(screen.queryByRole('dialog', { name: '选择默认工作区分支' })).not.toBeInTheDocument()
  })

  it('marks worktree rows without repeating the branch name or current marker', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaces: [
        {
          name: 'main',
          directory: '/tmp/alpha-project',
          gitBranch: 'main',
          isCurrent: false
        },
        {
          name: 'test',
          directory: '/tmp/alpha-project-worktrees/test',
          gitBranch: 'test',
          isCurrent: true
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByRole('button', { name: 'test 独立工作区' })).toBeEnabled()
    expect(within(projectCard).queryByText('当前')).not.toBeInTheDocument()
    expect(within(projectCard).queryByRole('button', { name: 'test 当前 test' })).toBeNull()
  })

  it('checks out a selectable local branch in the main workspace', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranches: [
        {
          name: 'main',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/free',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const checkedOutWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      gitBranch: 'feature/free',
      gitBranches: [
        {
          name: 'main',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'feature/free',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false,
          isLocked: false,
          lockReason: null
        }
      ]
    })
    const checkoutMainWorkspaceBranch = vi.fn(async () => checkedOutWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        checkoutMainWorkspaceBranch
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '选择默认工作区分支 main' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '选择默认工作区分支' })).getByRole(
        'button',
        { name: /feature\/free/ }
      )
    )

    await waitFor(() =>
      expect(checkoutMainWorkspaceBranch).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        branchName: 'feature/free'
      })
    )
    await screen.findByRole('button', { name: '切换到默认工作区 feature/free' })
    expect(screen.queryByText('默认工作区')).not.toBeInTheDocument()
  })
})
