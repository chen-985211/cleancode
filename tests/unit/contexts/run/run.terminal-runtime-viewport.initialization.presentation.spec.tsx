import { act, render, waitFor } from '@testing-library/react'

import { TerminalRuntimeViewport } from '../../../../src/contexts/run/presentation/components/TerminalRuntimeViewport'
import { TerminalSurfaceRegistryProvider } from '../../../../src/contexts/run/presentation/components/TerminalSurfaceRegistryProvider'
import {
  TerminalSurfaceRegistry,
  type TerminalSurface
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { createTerminalXtermSurface } from '../../../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface'
import type { TerminalViewState } from '../../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'

vi.mock('../../../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface', () => ({
  createTerminalXtermSurface: vi.fn(() => ({
    attach: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
    clearSearch: vi.fn(),
    find: vi.fn(),
    focus: vi.fn(),
    getDiagnostics: vi.fn(() => ({ pendingOutputBytes: 0, rendererState: 'dom' })),
    isBracketedPasteMode: vi.fn(() => false),
    isOutputSettled: vi.fn(() => true),
    onOutputSettled: vi.fn(() => () => undefined),
    restore: vi.fn(async () => 'ready' as const),
    setResizeSuspended: vi.fn(),
    setScrollbackRows: vi.fn(),
    write: vi.fn()
  }))
}))

const idle: TerminalViewState = {
  sessionId: null,
  status: 'idle',
  output: '',
  terminalSourceTheme: 'dark'
}
const identity = {
  projectId: 'project',
  workspaceId: 'main',
  blockId: 'block',
  sessionId: 'session',
  runId: 'run',
  generation: 1
}
const running: TerminalViewState = {
  ...idle,
  status: 'running',
  sessionId: identity.sessionId,
  runIdentity: identity
}

function viewport(session: TerminalViewState, registry: TerminalSurfaceRegistry) {
  return (
    <TerminalSurfaceRegistryProvider registry={registry}>
      <TerminalRuntimeViewport
        blockName="Terminal"
        session={session}
        focusRequestId={0}
        onDimensionsChange={vi.fn()}
        onInput={vi.fn()}
        onRestart={vi.fn()}
      />
    </TerminalSurfaceRegistryProvider>
  )
}

describe('ordinary terminal first surface initialization', () => {
  let originalUserAgent: string
  beforeEach(() => {
    originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    vi.mocked(createTerminalXtermSurface).mockClear()
  })
  afterEach(() =>
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent })
  )

  it('adopts the measured idle surface for the first run and retires it only on replacement', async () => {
    let nextView = 0
    const registry = new TerminalSurfaceRegistry(undefined, () => `view-${++nextView}`)
    const workspace = render(viewport(idle, registry))
    const first = vi.mocked(createTerminalXtermSurface).mock.results[0]!.value as TerminalSurface
    await act(async () => {})
    expect(first.restore).not.toHaveBeenCalled()
    workspace.rerender(viewport(running, registry))
    await waitFor(() => expect(first.restore).toHaveBeenCalledOnce())
    expect(createTerminalXtermSurface).toHaveBeenCalledOnce()
    expect(first.dispose).not.toHaveBeenCalled()
    expect(registry.getDiagnostics().surfaceCount).toBe(1)
    expect(workspace.container.querySelector('.terminal-viewport')).toHaveAttribute(
      'data-terminal-attached-session-id',
      identity.sessionId
    )

    workspace.rerender(
      viewport(
        {
          ...running,
          sessionId: 'replacement',
          runIdentity: { ...identity, sessionId: 'replacement', generation: 2 }
        },
        registry
      )
    )
    await waitFor(() => expect(first.dispose).toHaveBeenCalledOnce())
    expect(createTerminalXtermSurface).toHaveBeenCalledTimes(2)
    const second = vi.mocked(createTerminalXtermSurface).mock.results[1]!.value as TerminalSurface
    workspace.unmount()
    expect(second.dispose).toHaveBeenCalledOnce()
    expect(registry.getDiagnostics().surfaceCount).toBe(0)
    registry.disposeAll()
  })

  it('does not replay unbound output or reset the measured grid before the authoritative snapshot', async () => {
    const registry = new TerminalSurfaceRegistry()
    const workspace = render(viewport({ ...idle, output: 'unbound output' }, registry))
    const first = vi.mocked(createTerminalXtermSurface).mock.results[0]!.value as TerminalSurface
    await act(async () => {})
    expect(first.restore).not.toHaveBeenCalled()
    workspace.rerender(viewport(running, registry))
    await waitFor(() => expect(first.restore).toHaveBeenCalledOnce())
    expect(createTerminalXtermSurface).toHaveBeenCalledOnce()
    expect(vi.mocked(first.restore).mock.calls[0]![0].identity.sessionId).toBe(identity.sessionId)
    workspace.unmount()
    registry.disposeAll()
  })

  it.each(['unmount', 'theme'] as const)('releases an unbound surface on %s', async (action) => {
    const registry = new TerminalSurfaceRegistry()
    const workspace = render(viewport(idle, registry))
    const first = vi.mocked(createTerminalXtermSurface).mock.results[0]!.value as TerminalSurface
    await act(async () => {})
    if (action === 'theme') {
      workspace.rerender(viewport({ ...running, terminalSourceTheme: 'light' }, registry))
      expect(createTerminalXtermSurface).toHaveBeenCalledTimes(2)
    }
    workspace.unmount()
    expect(first.dispose).toHaveBeenCalledOnce()
    registry.disposeAll()
  })
})
