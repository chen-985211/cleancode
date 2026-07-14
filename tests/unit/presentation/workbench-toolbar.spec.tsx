import { fireEvent, render, screen, within } from '@testing-library/react'

import { WorkbenchToolbar } from '../../../src/presentation/app-shell/WorkbenchToolbar'

describe('workbench toolbar', () => {
  it('keeps workflow controls out of the idle toolbar and reveals stop only while active', () => {
    const onStopWorkflow = vi.fn()
    const props = {
      isDesktopRuntime: true,
      hasWorkbench: true,
      isWorkflowActive: false,
      workflowStatus: null,
      workflowError: null,
      isTerminalGroupSelectionMode: false,
      selectedTerminalGroupCandidateCount: 0,
      canBeginTerminalGroupSelection: true,
      canCreateTerminalGroup: false,
      onCreateTerminalBlock: vi.fn(),
      onCreateWorkspaceAgent: vi.fn(),
      onBeginTerminalGroupSelection: vi.fn(),
      onCreateTerminalGroup: vi.fn(),
      onCancelTerminalGroupSelection: vi.fn(),
      onStopWorkflow
    } as const

    const { rerender } = render(<WorkbenchToolbar {...props} />)
    const toolbar = within(screen.getByLabelText('工作台工具栏'))

    expect(toolbar.queryByRole('button', { name: '运行流程' })).not.toBeInTheDocument()
    expect(toolbar.queryByRole('button', { name: '停止流程' })).not.toBeInTheDocument()

    rerender(<WorkbenchToolbar {...props} isWorkflowActive workflowStatus="running" />)

    fireEvent.click(toolbar.getByRole('button', { name: '停止流程' }))

    expect(onStopWorkflow).toHaveBeenCalledOnce()
  })
})
