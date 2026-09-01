import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { useCanvasPaneContextMenu } from '../../../src/presentation/app-shell/workbench/menus/useCanvasPaneContextMenu'
import { CanvasMenuMotionProvider } from '../../../src/presentation/app-shell/workbench/menus/CanvasMenuMotionProvider'

describe('canvas pane context menu', () => {
  it('exposes the existing terminal actions with their configured shortcuts', async () => {
    const actions = createActions()
    render(<Harness actions={actions} graphId="graph-1" />)

    const pane = screen.getByTestId('pane')
    const event = createEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    fireEvent(pane, event)

    expect(event.defaultPrevented).toBe(true)
    expect(actions.onBeforeOpen).toHaveBeenCalledOnce()
    const menu = screen.getByRole('menu', { name: '画布操作' })
    const createTerminal = within(menu).getByRole('menuitem', { name: '新建终端积木' })
    const groupTerminals = within(menu).getByRole('menuitem', { name: '组合终端' })
    expect(createTerminal.querySelector('[data-icon-role="terminal"]')).toHaveAttribute(
      'data-icon-glyph',
      'terminal-window'
    )
    expect(groupTerminals.querySelector('[data-icon-role="terminal-group"]')).toHaveAttribute(
      'data-icon-glyph',
      'stack'
    )
    expect(within(menu).getByText('⌘T')).toBeInTheDocument()
    expect(within(menu).getByText('⌘G')).toBeInTheDocument()
    await waitFor(() => expect(createTerminal).toHaveFocus())

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(groupTerminals).toHaveFocus()
    fireEvent.click(groupTerminals)
    expect(actions.onBeginTerminalGroupSelection).toHaveBeenCalledOnce()
    expect(actions.onFitCanvas).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: '画布操作', hidden: true })).not.toBeInTheDocument()
    )

    fireEvent.contextMenu(pane, { clientX: 410, clientY: 300 })
    fireEvent.click(screen.getByRole('menuitem', { name: '新建终端积木' }))
    expect(actions.onCreateTerminal).toHaveBeenCalledOnce()
  })

  it('blocks the menu during modal canvas interactions and invalidates it on graph changes', () => {
    const actions = createActions()
    const { rerender } = render(<Harness actions={actions} graphId="graph-1" isBlocked />)
    const pane = screen.getByTestId('pane')

    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()

    rerender(<Harness actions={actions} graphId="graph-1" />)
    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    expect(screen.getByRole('menu', { name: '画布操作' })).toBeInTheDocument()

    rerender(<Harness actions={actions} graphId="graph-2" />)
    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()
  })

  it('returns keyboard focus to the canvas entry point when Escape interrupts the menu', async () => {
    const actions = createActions()
    render(<Harness actions={actions} graphId="graph-1" />)

    const pane = screen.getByTestId('pane')
    pane.focus()
    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: '新建终端积木' })).toHaveFocus()
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(pane).toHaveFocus()
    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()
  })

  it('toggles closed on a repeated secondary click without replaying open preparation', () => {
    const actions = createActions()
    render(<Harness actions={actions} graphId="graph-1" />)

    const pane = screen.getByTestId('pane')
    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })
    expect(screen.getByRole('menu', { name: '画布操作' })).toBeInTheDocument()

    fireEvent.contextMenu(pane, { clientX: 320, clientY: 240 })

    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()
    expect(actions.onBeforeOpen).toHaveBeenCalledOnce()
  })

  it('preserves toggle parity when two secondary intents arrive before a render', () => {
    const actions = createActions()
    render(<Harness actions={actions} graphId="graph-1" />)

    fireEvent.contextMenu(screen.getByTestId('rapid-pane'), {
      clientX: 320,
      clientY: 240
    })

    expect(screen.queryByRole('menu', { name: '画布操作' })).not.toBeInTheDocument()
    expect(actions.onBeforeOpen).toHaveBeenCalledOnce()
  })
})

interface HarnessProps {
  readonly actions: ReturnType<typeof createActions>
  readonly graphId: string
  readonly isBlocked?: boolean
}

function Harness({ actions, graphId, isBlocked = false }: HarnessProps) {
  const contextMenu = useCanvasPaneContextMenu({
    canCreateTerminal: true,
    canGroupTerminals: true,
    graphId,
    isBlocked,
    shortcutTooltips: {
      createTerminal: '新建终端积木 (⌘T)',
      groupTerminals: '组合终端 (⌘G)'
    },
    ...actions
  })

  return (
    <CanvasMenuMotionProvider reducedMotion>
      <div data-testid="pane" tabIndex={-1} onContextMenu={contextMenu.open} />
      <div
        data-testid="rapid-pane"
        onContextMenu={(event) => {
          contextMenu.open(event)
          contextMenu.open(event)
        }}
      />
      {contextMenu.menu}
    </CanvasMenuMotionProvider>
  )
}

function createActions() {
  return {
    onBeforeOpen: vi.fn(),
    onBeginTerminalGroupSelection: vi.fn(),
    onCreateTerminal: vi.fn(),
    onFitCanvas: vi.fn()
  }
}
