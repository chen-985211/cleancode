import {
  WindowsAgentShellReadiness,
  windowsAgentShellReadyMarker
} from '../../../../src/contexts/run/infrastructure/pty/WindowsAgentShellReadiness'

describe('Windows Agent shell readiness', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['one output chunk', [windowsAgentShellReadyMarker]],
    [
      'split output chunks',
      [windowsAgentShellReadyMarker.slice(0, 7), windowsAgentShellReadyMarker.slice(7)]
    ]
  ])('becomes ready when the marker arrives in %s', async (_, chunks) => {
    const readiness = new WindowsAgentShellReadiness({ deadlineMs: 5_000 })

    for (const chunk of chunks) readiness.acceptOutput(chunk)

    await expect(readiness.waitForReady()).resolves.toBeUndefined()
    expect(readiness.snapshot()).toMatchObject({
      phase: 'ready',
      markerMatchBytes: windowsAgentShellReadyMarker.length
    })
  })

  it('fails immediately when the shell exits before the marker arrives', async () => {
    const readiness = new WindowsAgentShellReadiness({ deadlineMs: 5_000 })
    readiness.acceptOutput('PowerShell startup')

    readiness.acceptExit()

    await expect(readiness.waitForReady()).rejects.toThrow(
      /exited before its interactive prompt became ready.*receivedOutputBytes=18/u
    )
    expect(readiness.snapshot()).toMatchObject({
      phase: 'exited',
      receivedOutputBytes: 18
    })
  })

  it('uses the deadline only to fail a shell that never reaches a terminal state', async () => {
    const readiness = new WindowsAgentShellReadiness({ deadlineMs: 5_000 })
    const readinessResult = readiness.waitForReady()
    readiness.acceptOutput(windowsAgentShellReadyMarker.slice(0, 9))
    const rejection = expect(readinessResult).rejects.toThrow(
      /did not become ready.*deadlineMs=5000.*receivedOutputBytes=9.*markerMatchBytes=9/u
    )

    await vi.advanceTimersByTimeAsync(5_000)

    await rejection
    expect(readiness.snapshot()).toMatchObject({
      phase: 'deadlineExceeded',
      markerMatchBytes: 9,
      receivedOutputBytes: 9
    })
  })

  it('keeps the first terminal outcome when output or exit arrives late', async () => {
    const readiness = new WindowsAgentShellReadiness({ deadlineMs: 5_000 })
    readiness.acceptOutput(windowsAgentShellReadyMarker)
    await readiness.waitForReady()

    readiness.acceptExit()
    await vi.advanceTimersByTimeAsync(5_000)

    expect(readiness.snapshot().phase).toBe('ready')
  })
})
