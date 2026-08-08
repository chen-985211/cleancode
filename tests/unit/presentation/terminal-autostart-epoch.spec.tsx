import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types'

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  NodeResizeControl: () => null,
  NodeResizer: () => null,
  Position: { Left: 'left', Right: 'right' }
}))

vi.mock('../../../src/presentation/app-shell/TerminalViewport', () => ({
  TerminalViewport: ({
    isInputDisabled,
    onDimensionsChange
  }: {
    isInputDisabled: boolean
    onDimensionsChange: (value: unknown) => void
  }) => (
    <>
      <span data-testid="terminal-input-disabled">{String(isInputDisabled)}</span>
      <button type="button" onClick={() => onDimensionsChange({ columns: 100, rows: 30 })}>
        measure terminal
      </button>
    </>
  )
}))

describe('terminal autostart runtime epoch', () => {
  it('starts at most once per reconciled runtime epoch and retries after a new epoch', async () => {
    const onStart = vi.fn()
    const baseData = createTerminalNodeData(onStart)
    const { rerender } = renderTerminal({
      ...baseData,
      session: { ...baseData.session, isRecoveryPending: true }
    })

    fireEvent.click(screen.getByRole('button', { name: 'measure terminal' }))
    expect(onStart).not.toHaveBeenCalled()

    rerenderTerminal(rerender, baseData)
    await waitFor(() => expect(onStart).toHaveBeenCalledOnce())
    rerenderTerminal(rerender, baseData)
    expect(onStart).toHaveBeenCalledOnce()

    rerenderTerminal(rerender, {
      ...baseData,
      session: { ...baseData.session, isRecoveryPending: true }
    })
    rerenderTerminal(rerender, baseData)
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(2))
  })

  it('disables terminal input after the current session has ended', () => {
    const baseData = createTerminalNodeData(vi.fn())

    renderTerminal({
      ...baseData,
      session: {
        ...baseData.session,
        sessionId: 'workflow-session',
        status: 'exited'
      }
    })

    expect(screen.getByTestId('terminal-input-disabled')).toHaveTextContent('true')
  })

  it('projects an explicit failed auto-start outcome for pending focus invalidation', () => {
    const data = createTerminalNodeData(vi.fn())
    const { container, rerender } = renderTerminal({
      ...data,
      session: { ...data.session, autoStartStatus: 'pending' }
    })

    expect(container.querySelector('[data-terminal-block-id]')).toHaveAttribute(
      'data-terminal-auto-start-status',
      'pending'
    )

    rerenderTerminal(rerender, {
      ...data,
      session: { ...data.session, autoStartStatus: 'failed' }
    })
    expect(container.querySelector('[data-terminal-block-id]')).toHaveAttribute(
      'data-terminal-auto-start-status',
      'failed'
    )
  })
})

function renderTerminal(data: TerminalFlowNode['data']) {
  return render(terminalNode(data))
}

function rerenderTerminal(
  rerender: ReturnType<typeof render>['rerender'],
  data: TerminalFlowNode['data']
): void {
  rerender(terminalNode(data))
}

function terminalNode(data: TerminalFlowNode['data']) {
  return (
    <TerminalNode
      id="terminal-1"
      type="terminal"
      data={data}
      dragging={false}
      zIndex={0}
      selectable
      deletable
      selected={false}
      draggable
      isConnectable={false}
      positionAbsoluteX={240}
      positionAbsoluteY={180}
    />
  )
}

function createTerminalNodeData(
  onStart: TerminalFlowNode['data']['onStart']
): TerminalFlowNode['data'] {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: 'terminal-1'
    },
    block: {
      id: 'terminal-1',
      type: 'terminal',
      name: 'Terminal',
      description: 'Local shell',
      launchCommand: '',
      position: { x: 240, y: 180 },
      size: defaultTerminalBlockSize
    },
    session: { sessionId: null, status: 'idle', output: '' },
    isSelected: false,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    onStart,
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(),
    onSelect: vi.fn(),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
