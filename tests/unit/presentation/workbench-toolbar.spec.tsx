import { render, screen, within } from '@testing-library/react'

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
  })

  it('keeps workflow status and controls out of the toolbar in every run state', () => {
    const props = {
      isDesktopRuntime: true,
      hasWorkbench: true,
      isTerminalGroupSelectionMode: false,
      selectedTerminalGroupCandidateCount: 0,
      canBeginTerminalGroupSelection: true,
      canCreateTerminalGroup: false,
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
        onCreateTerminalBlock={vi.fn()}
        onCreateWorkspaceAgent={vi.fn()}
        onBeginTerminalGroupSelection={vi.fn()}
        onCreateTerminalGroup={vi.fn()}
        onCancelTerminalGroupSelection={vi.fn()}
      />
    )

    expect(screen.queryByText('流程失败')).not.toBeInTheDocument()
  })
})
