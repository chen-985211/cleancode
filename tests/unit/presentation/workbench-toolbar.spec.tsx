import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { WorkbenchToolbar } from '../../../src/presentation/app-shell/WorkbenchToolbar'

describe('workbench toolbar', () => {
  it('keeps Agent creation separate at the right edge of the toolbar', () => {
    render(
      <WorkbenchToolbar
        isDesktopRuntime
        hasWorkbench
        isTerminalGroupSelectionMode={false}
        selectedTerminalGroupCandidateCount={0}
        canBeginTerminalGroupSelection
        canCreateTerminalGroup={false}
        shortcutTooltips={shortcutTooltips}
        onCreateTerminalBlock={vi.fn()}
        onCreateWorkspaceAgent={vi.fn()}
        onBeginTerminalGroupSelection={vi.fn()}
        onCreateTerminalGroup={vi.fn()}
        onCancelTerminalGroupSelection={vi.fn()}
      />
    )

    const toolbar = screen.getByLabelText('工作台工具栏')
    const terminalTools = within(toolbar).getByRole('group', { name: '终端工具' })
    const agentTools = within(toolbar).getByRole('group', { name: 'Agent 工具' })

    expect(
      within(terminalTools).queryByRole('button', { name: '新建 Agent' })
    ).not.toBeInTheDocument()
    expect(within(agentTools).getByRole('button', { name: '新建 Agent' })).toBeInTheDocument()
    expect(toolbar.lastElementChild).toBe(agentTools)

    expect(
      within(terminalTools)
        .getByRole('button', { name: '新建终端积木' })
        .querySelector('[data-icon-role="terminal"]')
    ).toHaveAttribute('data-icon-glyph', 'terminal-window')
    expect(
      within(terminalTools)
        .getByRole('button', { name: '组合终端' })
        .querySelector('[data-icon-role="terminal-group"]')
    ).toHaveAttribute('data-icon-glyph', 'stack')
    expect(
      within(agentTools)
        .getByRole('button', { name: '新建 Agent' })
        .querySelector('[data-icon-role="agent"]')
    ).toHaveAttribute('data-icon-glyph', 'robot')
  })

  it('keeps workflow status and controls out of the toolbar in every run state', () => {
    const props = {
      isDesktopRuntime: true,
      hasWorkbench: true,
      isTerminalGroupSelectionMode: false,
      selectedTerminalGroupCandidateCount: 0,
      canBeginTerminalGroupSelection: true,
      canCreateTerminalGroup: false,
      shortcutTooltips,
      onCreateTerminalBlock: vi.fn(),
      onCreateWorkspaceAgent: vi.fn(),
      onBeginTerminalGroupSelection: vi.fn(),
      onCreateTerminalGroup: vi.fn(),
      onCancelTerminalGroupSelection: vi.fn()
    } as const

    const { rerender } = render(<WorkbenchToolbar {...props} />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()

    rerender(<WorkbenchToolbar {...props} />)

    expect(toolbar.queryByText('流程运行中')).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()
  })

  it('keeps a completed workflow failure out of the toolbar', () => {
    render(
      <WorkbenchToolbar
        isDesktopRuntime
        hasWorkbench
        isTerminalGroupSelectionMode={false}
        selectedTerminalGroupCandidateCount={0}
        canBeginTerminalGroupSelection
        canCreateTerminalGroup={false}
        shortcutTooltips={shortcutTooltips}
        onCreateTerminalBlock={vi.fn()}
        onCreateWorkspaceAgent={vi.fn()}
        onBeginTerminalGroupSelection={vi.fn()}
        onCreateTerminalGroup={vi.fn()}
        onCancelTerminalGroupSelection={vi.fn()}
      />
    )

    expect(screen.queryByText('流程失败')).not.toBeInTheDocument()
  })

  it('shows the current configurable shortcuts in action tooltips', async () => {
    render(
      <WorkbenchToolbar
        isDesktopRuntime
        hasWorkbench
        isTerminalGroupSelectionMode={false}
        selectedTerminalGroupCandidateCount={0}
        canBeginTerminalGroupSelection
        canCreateTerminalGroup={false}
        shortcutTooltips={{
          createAgent: '新建 Agent (⌘⇧A)',
          createTerminal: '新建终端积木 (⌘T)',
          groupTerminals: '组合终端 (⌘G)'
        }}
        onCreateTerminalBlock={vi.fn()}
        onCreateWorkspaceAgent={vi.fn()}
        onBeginTerminalGroupSelection={vi.fn()}
        onCreateTerminalGroup={vi.fn()}
        onCancelTerminalGroupSelection={vi.fn()}
      />
    )

    await expectPointerTooltip('新建终端积木', '新建终端积木 (⌘T)')
    await expectPointerTooltip('组合终端', '组合终端 (⌘G)')
    await expectPointerTooltip('新建 Agent', '新建 Agent (⌘⇧A)')
  })
})

const shortcutTooltips = {
  createAgent: '新建 Agent (⌘⇧A)',
  createTerminal: '新建终端积木 (⌘T)',
  groupTerminals: '组合终端 (⌘G)'
} as const

async function expectPointerTooltip(buttonName: string, tooltip: string): Promise<void> {
  const button = screen.getByRole('button', { name: buttonName })
  fireEvent.pointerMove(button, { pointerType: 'mouse' })
  expect(await screen.findByRole('tooltip')).toHaveTextContent(tooltip)
  fireEvent.pointerLeave(button, { pointerType: 'mouse' })
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
}
