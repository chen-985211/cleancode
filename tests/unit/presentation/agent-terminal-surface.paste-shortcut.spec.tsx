import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'

import { AgentTerminalSurface } from '../../../src/presentation/app-shell/AgentTerminalSurface'

describe('Agent terminal paste shortcuts', () => {
  const originalPlatform = navigator.platform

  afterEach(() => {
    Object.defineProperty(navigator, 'platform', {
      configurable: true,
      value: originalPlatform
    })
  })

  it('leaves Windows Ctrl+V to native text paste without forwarding it to xterm', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
    const { container } = renderAgentTerminalSurface()
    const viewport = container.querySelector('.agent-terminal-viewport')!
    const textarea = document.createElement('textarea')
    const xtermKeyHandler = vi.fn()
    textarea.addEventListener('keydown', xtermKeyHandler)
    viewport.append(textarea)

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'v'
    })
    fireEvent(textarea, event)

    expect(xtermKeyHandler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps Windows Alt+V available to the Agent TUI for image paste', () => {
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
    const { container } = renderAgentTerminalSurface()
    const viewport = container.querySelector('.agent-terminal-viewport')!
    const textarea = document.createElement('textarea')
    const xtermKeyHandler = vi.fn()
    textarea.addEventListener('keydown', xtermKeyHandler)
    viewport.append(textarea)

    fireEvent.keyDown(textarea, { altKey: true, key: 'v' })

    expect(xtermKeyHandler).toHaveBeenCalledOnce()
  })
})

function renderAgentTerminalSurface() {
  return render(
    <AgentTerminalSurface
      activeOutput=""
      providerName="Fixture Agent"
      terminalElementRef={createRef<HTMLDivElement>()}
      onFallbackInput={vi.fn()}
      session={null}
      useFallback={false}
    />
  )
}
