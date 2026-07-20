import { act, renderHook } from '@testing-library/react'
import type { MouseEvent as ReactMouseEvent } from 'react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useWorkbenchNodeSelection } from '../../../src/presentation/app-shell/useWorkbenchNodeSelection'

describe('workbench node selection', () => {
  it('clears terminal, terminal group, and Agent selection from the canvas pane', () => {
    const { input, result } = renderSelectionHook()

    act(() => {
      result.current.clearWorkbenchSelection()
    })

    expect(input.setSelectedAgentId).toHaveBeenCalledWith(null)
    expect(input.setSelectedTerminalBlockIds).toHaveBeenCalledWith([])
    expect(input.setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
  })

  it('selects a terminal group only from its title and clears Agent selection', () => {
    const { input, result } = renderSelectionHook()
    const header = document.createElement('div')
    const title = document.createElement('strong')
    const action = document.createElement('button')
    const body = document.createElement('div')
    header.dataset.workbenchNodeTitle = 'true'
    header.append(title, action)

    act(() => {
      result.current.selectWorkbenchNode(createClickEvent(title), createTerminalGroupNode())
    })

    expect(input.selectTerminalGroup).toHaveBeenCalledWith('development-group')
    expect(input.setSelectedAgentId).toHaveBeenCalledWith(null)

    input.selectTerminalGroup.mockClear()

    act(() => {
      result.current.selectWorkbenchNode(createClickEvent(body), createTerminalGroupNode())
      result.current.selectWorkbenchNode(createClickEvent(action), createTerminalGroupNode())
    })

    expect(input.selectTerminalGroup).not.toHaveBeenCalled()
  })

  it('clears terminal group and Agent selection before selecting terminals', () => {
    const { input, result } = renderSelectionHook()

    act(() => {
      result.current.selectTerminalFromTitle('backend-terminal', true)
    })

    expect(input.setSelectedAgentId).toHaveBeenCalledWith(null)
    expect(input.setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
    expect(input.selectTerminalBlock).toHaveBeenCalledWith('backend-terminal', true)
  })

  it.each([
    ['terminal', 'backend-terminal'],
    ['terminalGroup', 'development-group'],
    ['agentConsole', 'agent:reviewer']
  ] as const)(
    'selects a %s from a directional shortcut through the existing selection owners',
    (type, id) => {
      const { input, result } = renderSelectionHook()

      act(() => {
        result.current.selectWorkbenchNodeFromShortcut({ id, type } as WorkbenchFlowNode)
      })

      if (type === 'terminal') {
        expect(input.selectTerminalBlock).toHaveBeenCalledWith(id, false)
      } else if (type === 'terminalGroup') {
        expect(input.selectTerminalGroup).toHaveBeenCalledWith(id)
      } else {
        expect(input.setSelectedAgentId).toHaveBeenCalledWith('reviewer')
      }
    }
  )
})

function renderSelectionHook() {
  const input = {
    isTerminalGroupSelectionMode: false,
    selectTerminalBlock: vi.fn(),
    selectTerminalGroup: vi.fn(),
    setNodes: vi.fn(),
    setSelectedAgentId: vi.fn(),
    setSelectedTerminalBlockIds: vi.fn(),
    setSelectedTerminalGroupId: vi.fn()
  }
  const hook = renderHook(() => useWorkbenchNodeSelection(input))

  return { input, ...hook }
}

function createClickEvent(target: EventTarget): ReactMouseEvent {
  return { target } as ReactMouseEvent
}

function createTerminalGroupNode(): WorkbenchFlowNode {
  return { id: 'development-group', type: 'terminalGroup' } as WorkbenchFlowNode
}
