// @vitest-environment node

import type { Page } from 'playwright'

import {
  e2eShellReadyMarker,
  waitForTerminalOutputInNewSession,
  waitForTerminalShellReady,
  waitForTerminalViewportGeometry
} from '../../support/e2eTerminal'

describe('E2E terminal support', () => {
  it('returns the session identity that produced the shell-ready marker', async () => {
    const jsonValue = vi.fn(async () => 'terminal-session-1')
    const waitForFunction = vi.fn(async () => ({ jsonValue }))
    const page = { waitForFunction } as unknown as Page

    await expect(waitForTerminalShellReady(page, 'Terminal 1')).resolves.toBe('terminal-session-1')
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), {
      marker: e2eShellReadyMarker,
      terminalName: 'Terminal 1'
    })
  })

  it('waits for output and a replacement session as one observation', async () => {
    const jsonValue = vi.fn(async () => 'terminal-session-2')
    const waitForFunction = vi.fn(async () => ({ jsonValue }))
    const page = { waitForFunction } as unknown as Page

    await expect(
      waitForTerminalOutputInNewSession(
        page,
        'Terminal 1',
        'terminal-session-1',
        'workflow-complete'
      )
    ).resolves.toBe('terminal-session-2')
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), {
      output: 'workflow-complete',
      previousSessionId: 'terminal-session-1',
      terminalName: 'Terminal 1'
    })
  })

  it('requires two matching non-zero viewport geometry observations', async () => {
    const settledGeometry = {
      node: [100, 100, 420, 280],
      renderer: 'dom',
      screen: [400, 240],
      viewport: [110, 130, 400, 240]
    }
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(settledGeometry)
      .mockResolvedValueOnce(settledGeometry)
    const page = { evaluate } as unknown as Page

    await waitForTerminalViewportGeometry(page, 'terminal-session-1')

    expect(evaluate).toHaveBeenCalledTimes(3)
    expect(evaluate).toHaveBeenLastCalledWith(expect.any(Function), 'terminal-session-1')
  })
})
