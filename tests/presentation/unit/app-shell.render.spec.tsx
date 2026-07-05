import { render, screen, within } from '@testing-library/react'

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
    expect(screen.queryByRole('button', { name: '打开项目' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目' })).toBeDisabled()
    expect(toolbar.getAllByRole('button')).toHaveLength(1)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
    expect(screen.getByLabelText('积木画布')).toBeInTheDocument()
    expect(screen.getByText('小地图')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Agent 面板' })).toBeInTheDocument()
    expect(screen.getByText('本地 Agent')).toBeInTheDocument()
    expect(screen.getByText('未接入')).toBeInTheDocument()
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
        createTerminalBlock: vi.fn(),
        updateTerminalBlockMetadata: vi.fn(),
        moveBlock: vi.fn(),
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
    expect(toolbar.getAllByRole('button')).toHaveLength(1)
    expect(toolbar.getByRole('button', { name: '新建终端积木' })).toBeDisabled()
    expect(screen.queryByText('浏览器预览模式')).not.toBeInTheDocument()
  })
})
