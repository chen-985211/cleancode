import { createRef } from 'react'
import { act, render, waitFor } from '@testing-library/react'

import type { TerminalBlockSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { AgentTerminalSurface } from '../../../src/presentation/app-shell/AgentTerminalSurface'
import { TerminalViewport } from '../../../src/presentation/app-shell/TerminalViewport'
import { createAgentSessionSnapshot } from '../../fixtures/presentation/appShellFixtures'

const terminalSurfaceState = vi.hoisted(() => ({
  onOpenSearch: null as (() => void) | null
}))

vi.mock('../../../src/presentation/app-shell/terminalXtermSurface', () => ({
  createTerminalXtermSurface: vi.fn(() => ({
    attach: vi.fn((attachment: { readonly onOpenSearch: () => void }) => {
      terminalSurfaceState.onOpenSearch = attachment.onOpenSearch
    }),
    clearSearch: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
    find: vi.fn(),
    focus: vi.fn(),
    getDiagnostics: vi.fn(() => ({ pendingOutputBytes: 0, rendererState: 'dom' })),
    isBracketedPasteMode: vi.fn(() => false),
    restore: vi.fn(async () => 'ready' as const),
    setResizeSuspended: vi.fn(),
    setScrollbackRows: vi.fn(),
    write: vi.fn()
  }))
}))

describe('terminal theme projection', () => {
  it('keeps the Agent reading inset and xterm mount in one theme coordination boundary', () => {
    const terminalElementRef = createRef<HTMLDivElement>()
    const baseSession = createAgentSessionSnapshot({ terminalSourceTheme: 'light' })
    const session = {
      ...baseSession,
      runtime: {
        ...baseSession.runtime,
        terminal: {
          ...baseSession.runtime.terminal,
          viewIdentity: {
            blockId: 'agent-1',
            generation: 3,
            owner: { id: 'agent-1', kind: 'agent' as const },
            projectId: 'project-1',
            runId: 'agent-terminal:agent-session-1',
            sessionId: 'terminal-session-1',
            workspaceId: 'main'
          }
        }
      }
    }
    const { container } = render(
      <AgentTerminalSurface
        activeOutput=""
        providerName="Fixture Agent"
        terminalElementRef={terminalElementRef}
        onFallbackInput={vi.fn()}
        session={session}
        useFallback={false}
      />
    )

    const projection = container.querySelector<HTMLElement>(
      '.terminal-theme-projection.agent-terminal-frame'
    )
    const viewport = container.querySelector<HTMLElement>('.agent-terminal-viewport')

    expect(projection).not.toBeNull()
    expect(projection).toHaveAttribute('data-terminal-source-theme', 'light')
    expect(viewport).not.toBeNull()
    expect(viewport).toHaveAttribute('data-agent-terminal-session-id', 'agent-session-1')
    expect(viewport).toHaveAttribute('data-agent-terminal-view-session-id', 'terminal-session-1')
    expect(projection).toContainElement(viewport)
    expect(terminalElementRef.current).toBe(viewport)
  })

  it('keeps ordinary terminal chrome outside the source-theme projection', async () => {
    const originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    terminalSurfaceState.onOpenSearch = null

    try {
      const { container, getByRole } = render(
        <TerminalViewport
          block={createTerminalBlock()}
          focusRequestId={0}
          onDimensionsChange={vi.fn()}
          onInput={vi.fn()}
          onRestart={vi.fn()}
          session={{
            output: '',
            sessionId: null,
            status: 'running',
            terminalSourceTheme: 'dark'
          }}
        />
      )
      await waitFor(() => expect(terminalSurfaceState.onOpenSearch).not.toBeNull())

      const viewport = container.querySelector<HTMLElement>('.terminal-viewport')
      const projection = container.querySelector<HTMLElement>('.terminal-theme-projection')
      expect(projection).toHaveAttribute('data-terminal-source-theme', 'dark')
      expect(projection).toContainElement(viewport)

      act(() => terminalSurfaceState.onOpenSearch?.())

      const search = getByRole('group', { name: '终端搜索控制' })
      expect(projection).not.toContainElement(search)
      expect(search.parentElement).toHaveClass('terminal-output-shell')
    } finally {
      Object.defineProperty(navigator, 'userAgent', {
        configurable: true,
        value: originalUserAgent
      })
    }
  })
})

function createTerminalBlock(): TerminalBlockSnapshot {
  return {
    description: '本地终端',
    id: 'terminal-1',
    launchCommand: '',
    name: 'Terminal 1',
    position: { x: 120, y: 80 },
    size: { height: 360, width: 640 },
    type: 'terminal'
  }
}
