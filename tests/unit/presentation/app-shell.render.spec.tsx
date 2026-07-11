import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'

describe('app shell', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('does not pretend browser preview data is a real workbench', async () => {
    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    expect(screen.getByRole('main', { name: 'cleancode workspace' })).toBeInTheDocument()
    expect(screen.queryByText('cleancode')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开项目' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目' })).toBeDisabled()
    expect(toolbar.getAllByRole('button')).toHaveLength(2)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '组合终端' })).toBeDisabled()
    expect(screen.getByLabelText('积木画布')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '积木导航小地图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起小地图' })).toBeInTheDocument()
    expect(screen.queryByText('小地图')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Agent 面板' })).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('积木画布').querySelector('[data-agent-console-node]')
    ).toBeInTheDocument()
    expect(screen.getAllByText('Codex CLI').length).toBeGreaterThan(0)
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
        saveGraph: vi.fn(),
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
    expect(toolbar.getAllByRole('button')).toHaveLength(2)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
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

  it('removes a remembered project through the desktop runtime API', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const removeProject = vi.fn(async () => [])

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: {
        appName: 'cleancode',
        listWorkbenches: vi.fn(async () => [workbench]),
        addProject: vi.fn(),
        removeProject,
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
        saveGraph: vi.fn(),
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
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    expect(within(projectCard).getByText('默认工作区')).toBeInTheDocument()

    fireEvent.click(within(projectCard).getByRole('button', { name: '移除项目' }))

    await waitFor(() =>
      expect(removeProject).toHaveBeenCalledWith({ projectDirectory: '/tmp/alpha-project' })
    )
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: '项目 alpha-project' })).not.toBeInTheDocument()
    )
    expect(screen.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
  })

  it('creates a git branch workspace through the desktop runtime API', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const featureWorkbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project', {
      workspaceName: 'feature/sidebar',
      workspaceDirectory: '/tmp/alpha-project-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    })
    const createBranchWorkspace = vi.fn(async () => featureWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        listWorkbenches: vi.fn(async () => [workbench]),
        createBranchWorkspace
      })
    })

    render(<AppShell />)
    const projectCard = await screen.findByRole('group', { name: '项目 alpha-project' })

    fireEvent.click(within(projectCard).getByRole('button', { name: '新建分支工作区' }))
    fireEvent.change(within(projectCard).getByLabelText('分支名称'), {
      target: { value: 'feature/sidebar' }
    })
    fireEvent.click(within(projectCard).getByRole('button', { name: '创建分支工作区' }))

    await waitFor(() =>
      expect(createBranchWorkspace).toHaveBeenCalledWith({
        projectDirectory: '/tmp/alpha-project',
        branchName: 'feature/sidebar'
      })
    )
    await screen.findByRole('button', { name: 'feature/sidebar worktree' })
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

    fireEvent.click(within(projectCard).getByRole('button', { name: 'feature/sidebar worktree' }))

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
          isSelectableInMainWorkspace: true
        },
        {
          name: 'feature/worktree',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/feature-worktree',
          isSelectableInMainWorkspace: false
        },
        {
          name: 'main',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false
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
    expect(
      within(projectCard).getByRole('button', { name: 'feature/worktree worktree' })
    ).toBeEnabled()

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
          isSelectableInMainWorkspace: false
        },
        {
          name: 'test',
          isCurrent: true,
          isMainWorkspaceBranch: false,
          worktreeDirectory: '/tmp/alpha-project-worktrees/test',
          isSelectableInMainWorkspace: false
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

    expect(within(projectCard).getByRole('button', { name: 'test worktree' })).toBeEnabled()
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
          isSelectableInMainWorkspace: false
        },
        {
          name: 'feature/free',
          isCurrent: false,
          isMainWorkspaceBranch: false,
          worktreeDirectory: null,
          isSelectableInMainWorkspace: true
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
          isSelectableInMainWorkspace: true
        },
        {
          name: 'feature/free',
          isCurrent: true,
          isMainWorkspaceBranch: true,
          worktreeDirectory: '/tmp/alpha-project',
          isSelectableInMainWorkspace: false
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
