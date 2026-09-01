import { render, waitFor } from '@testing-library/react'

import { TerminalRuntimeViewport } from '../../../../src/contexts/run/presentation/components/TerminalRuntimeViewport'

const attachmentIdentityMockState = vi.hoisted(() => ({
  detach: vi.fn()
}))

vi.mock('../../../../src/contexts/run/presentation/terminal-surface/terminalXtermSurface', () => ({
  createTerminalXtermSurface: vi.fn(() => ({
    attach: vi.fn(),
    clearSearch: vi.fn(),
    detach: attachmentIdentityMockState.detach,
    dispose: vi.fn(),
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

describe('terminal surface attachment identity', () => {
  let originalUserAgent: string

  beforeEach(() => {
    originalUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    attachmentIdentityMockState.detach.mockClear()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })
  })

  it('owns the attached session marker for the lifetime of the ordinary terminal surface', async () => {
    const workspace = render(
      <TerminalRuntimeViewport
        blockName="Terminal 1"
        focusRequestId={0}
        onDimensionsChange={vi.fn()}
        onInput={vi.fn()}
        onRestart={vi.fn()}
        session={{
          output: '',
          sessionId: 'terminal-session-1',
          status: 'running'
        }}
      />
    )
    const viewport = workspace.container.querySelector<HTMLElement>('.terminal-viewport')!

    await waitFor(() =>
      expect(viewport).toHaveAttribute('data-terminal-attached-session-id', 'terminal-session-1')
    )

    workspace.unmount()
    expect(viewport).not.toHaveAttribute('data-terminal-attached-session-id')
    expect(attachmentIdentityMockState.detach).toHaveBeenCalledWith(viewport)
  })
})
