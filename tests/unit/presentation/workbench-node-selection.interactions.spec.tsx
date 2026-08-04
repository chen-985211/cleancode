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
    expect(input.returnToGlobalCanvasView).toHaveBeenCalledOnce()
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
    expect(input.focusSelectedWorkbenchNode).toHaveBeenCalledWith('development-group')

    input.selectTerminalGroup.mockClear()

    act(() => {
      result.current.selectWorkbenchNode(createClickEvent(body), createTerminalGroupNode())
      result.current.selectWorkbenchNode(createClickEvent(action), createTerminalGroupNode())
    })

    expect(input.selectTerminalGroup).not.toHaveBeenCalled()
    expect(input.focusSelectedWorkbenchNode).toHaveBeenCalledOnce()
  })

  it('clears terminal group and Agent selection before focusing an exclusively selected terminal', () => {
    const { input, result } = renderSelectionHook()

    act(() => {
      result.current.selectTerminalFromTitle('backend-terminal', false)
    })

    expect(input.setSelectedAgentId).toHaveBeenCalledWith(null)
    expect(input.setSelectedTerminalGroupId).toHaveBeenCalledWith(null)
    expect(input.selectTerminalBlock).toHaveBeenCalledWith('backend-terminal', false)
    expect(input.focusSelectedWorkbenchNode).toHaveBeenCalledWith('backend-terminal')
  })

  it('does not focus the canvas for additive or terminal-group candidate selection', () => {
    const additiveSelection = renderSelectionHook()

    act(() => {
      additiveSelection.result.current.selectTerminalFromTitle('backend-terminal', true)
    })

    expect(additiveSelection.input.focusSelectedWorkbenchNode).not.toHaveBeenCalled()

    const candidateSelection = renderSelectionHook({ isTerminalGroupSelectionMode: true })

    act(() => {
      candidateSelection.result.current.selectTerminalFromTitle('backend-terminal', false)
    })

    expect(candidateSelection.input.focusSelectedWorkbenchNode).not.toHaveBeenCalled()
  })

  it('focuses an Agent selected from its title', () => {
    const { input, result } = renderSelectionHook()

    act(() => {
      result.current.selectAgentFromTitle('reviewer')
    })

    expect(input.focusSelectedWorkbenchNode).toHaveBeenCalledWith('agent:reviewer')
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
      expect(input.focusSelectedWorkbenchNode).not.toHaveBeenCalled()
    }
  )
})

function renderSelectionHook(options: { readonly isTerminalGroupSelectionMode?: boolean } = {}) {
  const input = {
    focusSelectedWorkbenchNode: vi.fn(),
    isTerminalGroupSelectionMode: options.isTerminalGroupSelectionMode ?? false,
    returnToGlobalCanvasView: vi.fn(),
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
