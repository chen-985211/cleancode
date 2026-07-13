import { act, renderHook } from '@testing-library/react'

import { useWorkbenchNodeSelection } from '../../../src/presentation/app-shell/useWorkbenchNodeSelection'

describe('workbench node selection', () => {
  it('clears terminal, terminal group, and Agent selection from the canvas pane', () => {
    const setSelectedAgentId = vi.fn()
    const setSelectedTerminalBlockIds = vi.fn()
    const setSelectedTerminalGroupId = vi.fn()
    const { result } = renderHook(() =>
      useWorkbenchNodeSelection({
        isTerminalGroupSelectionMode: false,
        selectTerminalBlock: vi.fn(),
        selectTerminalGroup: vi.fn(),
        setNodes: vi.fn(),
        setSelectedAgentId,
        setSelectedTerminalBlockIds,
        setSelectedTerminalGroupId
      })
    )

    act(() => {
      result.current.clearWorkbenchSelection()
    })

    expect(setSelectedAgentId).toHaveBeenCalledWith(null)
    expect(setSelectedTerminalBlockIds).toHaveBeenCalledWith([])
    expect(setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
  })
})
