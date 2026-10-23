import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TerminalGroupMoreMenu } from '../../../src/presentation/app-shell/workbench/nodes/terminal-group/TerminalGroupMoreMenu'
import { CanvasMenuMotionProvider } from '../../../src/presentation/app-shell/workbench/menus/CanvasMenuMotionProvider'
import { AgentConsoleActions } from '../../../src/presentation/app-shell/workbench/nodes/agent/AgentConsoleActions'
import { CanvasPaneContextMenu } from '../../../src/presentation/app-shell/workbench/menus/CanvasPaneContextMenu'
import { CanvasObjectContextMenu } from '../../../src/presentation/app-shell/workbench/menus/CanvasObjectContextMenu'
import { TerminalMoreMenu } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalMoreMenu'

describe('canvas node more menus', () => {
  it.each(['object', 'pane', 'agent', 'group', 'terminal'] as const)(
    'focuses %s menu actions only after the surface becomes interactive',
    async (kind) => {
      const browserFocus = HTMLElement.prototype.focus
      // jsdom does not enforce the native inert focus boundary used by Electron.
      const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
        this: HTMLElement,
        options
      ) {
        if (!this.closest('[inert], [aria-hidden="true"]')) browserFocus.call(this, options)
      })
      try {
        render(
          <CanvasMenuMotionProvider reducedMotion>
            {kind === 'object' ? (
              <CanvasObjectContextMenu
                open
                position={{ x: 40, y: 40 }}
                requestId={1}
                target={{
                  kind: 'terminal',
                  terminalBlockIds: ['terminal'],
                  selectedNodeIds: [],
                  selectedConnectionIds: []
                }}
                onClose={vi.fn()}
              />
            ) : kind === 'pane' ? (
              <CanvasPaneContextMenu
                open
                canCreateTerminal
                canGroupTerminals
                position={{ x: 40, y: 40 }}
                shortcutTooltips={{ createTerminal: 'Create', groupTerminals: 'Group' }}
                onClose={vi.fn()}
                onCreateTerminal={vi.fn()}
                onGroupTerminals={vi.fn()}
              />
            ) : kind === 'group' ? (
              <TerminalGroupMoreMenu name="Group" onRename={vi.fn()} onDissolve={vi.fn()} />
            ) : kind === 'terminal' ? (
              <TerminalMoreMenu
                terminalName="Terminal"
                isRunning
                isRecoveryPending={false}
                sessionKind="interactive"
                retentionPolicy="terminate-on-application-exit"
                onStop={vi.fn()}
                onToggleRetention={vi.fn()}
                onRestart={vi.fn()}
                onDelete={vi.fn()}
              />
            ) : (
              <AgentConsoleActions
                agent={{
                  agentId: 'agent',
                  name: 'Reviewer',
                  projectId: 'project',
                  workspaceId: 'main',
                  providerId: 'codex',
                  cleancodeMcpEnabled: true,
                  layout: { position: { x: 0, y: 0 }, size: { width: 420, height: 360 } }
                }}
                onRename={vi.fn()}
                onRemove={vi.fn()}
              />
            )}
          </CanvasMenuMotionProvider>
        )
        if (kind === 'group')
          fireEvent.click(screen.getByRole('button', { name: 'Group 更多组合操作' }))
        if (kind === 'terminal')
          fireEvent.click(screen.getByRole('button', { name: 'Terminal 更多终端操作' }))
        if (kind === 'agent')
          fireEvent.click(screen.getByRole('button', { name: 'Reviewer 更多操作' }))
        await waitFor(() => expect(screen.getAllByRole('menuitem')[0]).toHaveFocus())
      } finally {
        focus.mockRestore()
      }
    }
  )

  it('gives the same canvas coordinator ownership of terminal and group menus', async () => {
    render(
      <CanvasMenuMotionProvider reducedMotion>
        <TerminalGroupMoreMenu name="Group" onRename={vi.fn()} onDissolve={vi.fn()} />
        <TerminalMoreMenu
          terminalName="Terminal"
          isRunning
          isRecoveryPending={false}
          sessionKind="interactive"
          retentionPolicy="terminate-on-application-exit"
          onStop={vi.fn()}
          onToggleRetention={vi.fn()}
          onRestart={vi.fn()}
          onDelete={vi.fn()}
        />
      </CanvasMenuMotionProvider>
    )
    const group = screen.getByRole('button', { name: 'Group 更多组合操作' })
    const terminal = screen.getByRole('button', { name: 'Terminal 更多终端操作' })
    fireEvent.click(group)
    expect(screen.getByRole('menu', { name: 'Group 更多组合操作' })).toBeInTheDocument()
    fireEvent.click(terminal)
    await waitFor(() =>
      expect(screen.queryByRole('menu', { name: 'Group 更多组合操作' })).not.toBeInTheDocument()
    )
    expect(group).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    fireEvent.click(group)
    await waitFor(() => expect(terminal).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
  })

  it('supports the same keyboard entry, dismissal and precise group action', async () => {
    const onRename = vi.fn(),
      onDissolve = vi.fn()
    render(
      <CanvasMenuMotionProvider reducedMotion>
        <TerminalGroupMoreMenu name="Group" onRename={onRename} onDissolve={onDissolve} />
      </CanvasMenuMotionProvider>
    )
    const trigger = screen.getByRole('button', { name: 'Group 更多组合操作' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    const dissolve = await screen.findByRole('menuitem', { name: '解散组合' })
    await waitFor(() => expect(dissolve).toHaveFocus())
    fireEvent.keyDown(dissolve, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(onDissolve).not.toHaveBeenCalled()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const rename = await screen.findByRole('menuitem', { name: '重命名组合' })
    await waitFor(() => expect(rename).toHaveFocus())
    fireEvent.keyDown(rename, { key: 'End' })
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '解散组合' }), { key: 'Enter' })
    expect(onDissolve).toHaveBeenCalledOnce()
    expect(onRename).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
