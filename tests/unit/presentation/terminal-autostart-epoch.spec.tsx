import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { defaultTerminalBlockSize } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { TerminalNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'

const flowGeometry = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => flowGeometry.update,
  Handle: () => null,
  NodeResizeControl: () => null,
  NodeResizer: () => null,
  Position: { Left: 'left', Right: 'right' }
}))

vi.mock('../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalViewport', () => ({
  TerminalViewport: ({
    isInputDisabled,
    isResizeSuspended,
    onDimensionsChange
  }: {
    isInputDisabled: boolean
    isResizeSuspended: boolean
    onDimensionsChange: (value: unknown) => void
  }) => (
    <>
      <span data-testid="terminal-input-disabled">{String(isInputDisabled)}</span>
      <span data-testid="terminal-resize-suspended">{String(isResizeSuspended)}</span>
      <button type="button" onClick={() => onDimensionsChange({ columns: 100, rows: 30 })}>
        measure terminal
      </button>
    </>
  )
}))

describe('terminal autostart runtime epoch', () => {
  afterEach(() => vi.restoreAllMocks())
  it('refreshes handle geometry after motion without duplicating the initial React Flow measurement', () => {
    flowGeometry.update.mockClear()
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal(data)
    expect(flowGeometry.update).not.toHaveBeenCalled()
    rerenderTerminal(rerender, {
      ...data,
      objectMotion: {
        id: 'expand',
        kind: 'group-reflow',
        offset: { x: 0, y: 0 }
      }
    })
    expect(flowGeometry.update).not.toHaveBeenCalled()
    rerenderTerminal(rerender, data)
    expect(flowGeometry.update).toHaveBeenCalledExactlyOnceWith(data.block.id)
  })
  it('suspends intermediate terminal grid fitting until disclosure finishes', () => {
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal({
      ...data,
      objectMotion: {
        id: 'expand',
        kind: 'group-reflow',
        offset: { x: 0, y: 0 }
      }
    })
    expect(screen.getByTestId('terminal-resize-suspended')).toHaveTextContent('true')
    rerenderTerminal(rerender, { ...data, objectMotion: undefined })
    expect(screen.getByTestId('terminal-resize-suspended')).toHaveTextContent('false')
  })
  it('parks the same terminal view during disclosure without starting or resizing a session', () => {
    const data = createTerminalNodeData(vi.fn())
    const running = {
      ...data,
      session: { ...data.session, sessionId: 'live', status: 'running' as const }
    }
    const { rerender, container } = renderTerminal(running)
    const view = screen.getByTestId('terminal-input-disabled')
    rerenderTerminal(rerender, { ...running, block: { ...running.block, isCollapsed: true } })
    expect(screen.getByTestId('terminal-input-disabled')).toBe(view)
    expect(container.querySelector('.terminal-node__body')).toHaveAttribute('inert')
    expect(screen.getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Terminal 展开终端' }))
    expect(data.onResizeBlock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'terminal-1' }),
      expect.objectContaining({ isCollapsed: false, size: data.block.size })
    )
    expect(data.onStart).not.toHaveBeenCalled()
    expect(data.onResize).not.toHaveBeenCalled()
    rerenderTerminal(rerender, running)
    expect(screen.getByTestId('terminal-input-disabled')).toBe(view)
  })

  it('keeps the same viewport when an idle terminal receives its first session identity', () => {
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal(data)
    const view = screen.getByTestId('terminal-input-disabled')
    rerenderTerminal(rerender, {
      ...data,
      session: { ...data.session, sessionId: 'first', status: 'running' }
    })
    expect(screen.getByTestId('terminal-input-disabled')).toBe(view)
  })

  it('resets the viewport on genuine session replacement while adopting the next idle measurement', () => {
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal({
      ...data,
      session: { ...data.session, sessionId: 'old', status: 'running' }
    })
    const oldView = screen.getByTestId('terminal-input-disabled')
    rerenderTerminal(rerender, data)
    const measurement = screen.getByTestId('terminal-input-disabled')
    expect(measurement).not.toBe(oldView)
    rerenderTerminal(rerender, {
      ...data,
      session: { ...data.session, sessionId: 'new', status: 'running' }
    })
    expect(screen.getByTestId('terminal-input-disabled')).toBe(measurement)
    rerenderTerminal(rerender, {
      ...data,
      session: { ...data.session, sessionId: 'replacement', status: 'running' }
    })
    expect(screen.getByTestId('terminal-input-disabled')).not.toBe(measurement)
  })

  it('lets the collapsed shell open before mounting its first terminal body', async () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return {
          width: 220,
          height: this.classList.contains('terminal-node--collapsed') ? 44 : 280
        } as DOMRect
      })
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal({ ...data, block: { ...data.block, isCollapsed: true } })
    rerenderTerminal(rerender, data)
    expect(screen.queryByTestId('terminal-input-disabled')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Terminal 折叠终端' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.queryByRole('button', { name: 'Terminal 删除终端' })).not.toBeInTheDocument()
    await screen.findByTestId('terminal-input-disabled')
    expect(screen.getByRole('button', { name: 'Terminal 删除终端' })).toBeInTheDocument()
    bounds.mockRestore()
    expect(data.onStart).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('measure terminal'))
    expect(data.onStart).toHaveBeenCalledOnce()
  })

  it('does not mount or auto-start an initially collapsed terminal', () => {
    const data = createTerminalNodeData(vi.fn())
    renderTerminal({ ...data, block: { ...data.block, isCollapsed: true } })
    expect(screen.queryByTestId('terminal-input-disabled')).not.toBeInTheDocument()
    expect(data.onStart).not.toHaveBeenCalled()
  })

  it('does not auto-start a previously hidden terminal while its workflow is only a drag preview', () => {
    const data = createTerminalNodeData(vi.fn())
    const { rerender } = renderTerminal({ ...data, isObjectDragPreview: true })
    fireEvent.click(screen.getByText('measure terminal'))
    expect(data.onStart).not.toHaveBeenCalled()
    rerenderTerminal(rerender, data)
    expect(data.onStart).toHaveBeenCalledOnce()
  })

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
