// @vitest-environment node

import type { Page } from 'playwright'

import {
  createE2ePrintCommand,
  createE2eTerminalEnvironment,
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
      terminalName: 'Terminal 1',
      windows: process.platform === 'win32'
    })
  })

  it('recognizes a Windows prompt even when ConPTY appends redraw controls', async () => {
    const jsonValue = vi.fn(async () => 'terminal-session-1')
    type ShellReadyPredicate = (input: {
      readonly marker: string
      readonly terminalName: string
      readonly windows: boolean
    }) => string
    let predicate: ShellReadyPredicate | undefined
    const waitForFunction = vi.fn(async (candidate: ShellReadyPredicate) => {
      predicate = candidate
      return { jsonValue }
    })
    const page = { waitForFunction } as unknown as Page
    await waitForTerminalShellReady(page, 'Terminal 1')
    const evaluateShellReady = predicate as unknown as ShellReadyPredicate
    const terminalOutput = {
      dataset: { terminalSessionId: 'terminal-session-1' },
      getAttribute: (name: string) => (name === 'aria-label' ? 'Terminal 1 文本输出' : null),
      textContent: 'PS C:\\work\\app> \u001b[K\r\n\u001b[K\u001b[6;20H\u001b[?25h'
    }
    vi.stubGlobal('document', {
      querySelectorAll: () => [terminalOutput]
    })

    try {
      expect(
        evaluateShellReady({
          marker: e2eShellReadyMarker,
          terminalName: 'Terminal 1',
          windows: true
        })
      ).toBe('terminal-session-1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses the native shell and a Node command instead of a shell-specific print primitive', () => {
    const environment = createE2eTerminalEnvironment()
    const command = createE2ePrintCommand('portable-output')

    expect(environment.SHELL).toBe(process.platform === 'win32' ? 'powershell.exe' : '/bin/sh')
    expect(command).toContain(process.execPath)
    expect(command).not.toContain('printf')
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
