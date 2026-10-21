import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { AppShell } from '../../../src/presentation/app-shell/shell/AppShell'
import { shortcutBindingsStorageKey } from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcutPreference'

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
    const templateLibraryTrigger = screen.getByRole('button', { name: '收藏模板' })
    const languageSettingsTrigger = screen.getByRole('button', { name: '语言' })
    const themeSettingsTrigger = screen.getByRole('button', { name: '主题设置' })
    const applicationSettingsTrigger = screen.getByRole('button', { name: '设置' })
    expect(appSettings).toContainElement(templateLibraryTrigger)
    expect(appSettings).toContainElement(languageSettingsTrigger)
    expect(appSettings).toContainElement(themeSettingsTrigger)
    expect(appSettings).toContainElement(applicationSettingsTrigger)
    expect(templateLibraryTrigger.nextElementSibling).toBe(languageSettingsTrigger.parentElement)
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
    expect(toolbar.getAllByRole('button')).toHaveLength(2)
    expect(toolbar.queryByRole('button', { name: '新建终端积木' })).not.toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '新建 Agent' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '选择默认 Agent' })).toBeDisabled()
    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '组合终端' })).not.toBeInTheDocument()
    await openBlankCanvasMenu()
    expect(screen.getByRole('menuitem', { name: '新建终端积木' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '组合终端' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByLabelText('积木画布')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '积木导航小地图' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起小地图' })).toBeInTheDocument()
    expect(screen.queryByText('小地图')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Agent 面板' })).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('积木画布').querySelector('[data-agent-console-node]')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument()
    expect(screen.queryByText('桌面运行时未连接')).not.toBeInTheDocument()
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

  it('guides desktop users to open a project from the empty workspace', async () => {
    const addProject = vi.fn(async () => null)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ addProject })
    })

    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    expect(await screen.findByRole('heading', { name: 'CleanCode' })).toBeInTheDocument()
    expect(screen.queryByText('打开项目开始使用')).not.toBeInTheDocument()
    expect(screen.queryByText('选择一个本地项目目录，进入工作台。')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '打开项目' }))
    await waitFor(() => expect(addProject).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: '添加项目' })).toBeEnabled()
    expect(toolbar.getAllByRole('button')).toHaveLength(2)
    expect(toolbar.queryByRole('button', { name: '新建终端积木' })).not.toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: '新建 Agent' })).toBeDisabled()
    expect(toolbar.getByRole('button', { name: '选择默认 Agent' })).toBeDisabled()
    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '组合终端' })).not.toBeInTheDocument()
    await openBlankCanvasMenu()
    expect(screen.getByRole('menuitem', { name: '新建终端积木' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: '组合终端' })).toBeDisabled()
    expect(screen.queryByText('浏览器预览模式')).not.toBeInTheDocument()
  })

  it('does not synthesize an Agent for an open workbench without loaded Agent data', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)

    await screen.findByText('alpha-project')
    await waitFor(() => expect(screen.getByRole('button', { name: '新建 Agent' })).toBeEnabled())
    expect(
      screen.getByLabelText('积木画布').querySelector('[data-agent-console-node]')
    ).not.toBeInTheDocument()
    expect(runtimeApi.attachAgentSession).not.toHaveBeenCalled()
  })

  it('creates an empty drop target without entering a membership editing mode', async () => {
    const workbench = createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project')
    const runtimeApi = createRuntimeApi({
      listWorkbenches: vi.fn(async () => [workbench])
    })
    runtimeApi.createTerminalGroup.mockResolvedValue({
      ...workbench.graph,
      terminalGroups: [
        {
          id: 'new-group',
          isCollapsed: false,
          memberBlockIds: [],
          name: '启动项目',
          position: { x: 0, y: 0 },
          size: { width: 520, height: 320 },
          type: 'terminal-group'
        }
      ]
    })

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })

    render(<AppShell />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))
    await waitFor(() => expect(screen.getByRole('button', { name: '新建 Agent' })).toBeEnabled())

    await openBlankCanvasMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '组合终端' }))

    await screen.findByText('拖入终端或流程')
    expect(toolbar.queryByText('组合编辑')).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '创建组合' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
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
    expect(collapseSidebar.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
    expect(sidebar).not.toHaveAttribute('aria-hidden')

    fireEvent.click(collapseSidebar)

    expect(screen.getByLabelText('积木画布')).toBe(workspace)
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    const expandSidebar = within(titlebarNavigation).getByRole('button', {
      name: '展开侧边栏'
    })
    expect(titlebarNavigation.parentElement).toBe(sidebarColumn)
    expect(expandSidebar).toHaveAttribute('aria-expanded', 'false')
    expect(expandSidebar.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()

    fireEvent.click(expandSidebar)

    expect(screen.getByLabelText('积木画布')).toBe(workspace)
    expect(screen.getByLabelText('项目与分支工作区')).toBe(sidebar)
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

  it('updates a canvas menu shortcut immediately after editing its binding', async () => {
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

    await openBlankCanvasMenu()
    const createTerminal = screen.getByRole('menuitem', { name: '新建终端积木' })
    expect(createTerminal).toHaveTextContent('⌘⌥K')
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
        workspaceId: 'main'
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
})

async function openBlankCanvasMenu(): Promise<void> {
  const pane = document.querySelector<HTMLElement>('.react-flow__pane')
  if (!pane) throw new Error('Expected a React Flow pane')
  fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
  await screen.findByRole('menu', { name: '画布操作' })
}
