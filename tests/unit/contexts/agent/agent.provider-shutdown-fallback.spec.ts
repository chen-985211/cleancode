import { AgentProviderLaunchShutdownCoordinator } from '../../../../src/contexts/agent/application/use-cases/AgentProviderLaunchShutdownCoordinator'

describe('Provider shutdown fallback', () => {
  afterEach(() => vi.useRealTimers())

  it('waits for Provider resources after native input times out before allowing terminal stop', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const fallback = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const write = vi.fn()
    const coordinator = new AgentProviderLaunchShutdownCoordinator({ write })
    const session = { sessionId: 'session', providerLaunchGeneration: 1, isTerminalRunning: true }
    coordinator.trackLaunch(session, 1, {
      inputs: ['native-exit'],
      inputIntervalMs: 0,
      timeoutMs: 100,
      onTimeout: fallback
    })
    let stopped = false
    const shutdown = coordinator.request(session).then(() => {
      stopped = true
    })
    await vi.advanceTimersByTimeAsync(99)
    expect(fallback).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledWith('session', 'native-exit')
    expect(fallback).toHaveBeenCalledOnce()
    expect(stopped).toBe(false)
    release()
    await shutdown
    expect(stopped).toBe(true)
  })

  it.each(['exited', 'replaced'])(
    'does not run fallback for an already %s launch',
    async (reason) => {
      const fallback = vi.fn(async () => undefined)
      const coordinator = new AgentProviderLaunchShutdownCoordinator({ write: vi.fn() })
      const session = { sessionId: 'session', providerLaunchGeneration: 1, isTerminalRunning: true }
      const exited = coordinator.trackLaunch(session, 1, {
        inputs: ['native-exit'],
        inputIntervalMs: 0,
        timeoutMs: 100,
        onTimeout: fallback
      })
      if (reason === 'exited') exited()
      else session.providerLaunchGeneration = 2
      await coordinator.request(session)
      expect(fallback).not.toHaveBeenCalled()
    }
  )

  it('propagates fallback failure and permits a later user cleanup retry', async () => {
    const failure = new Error('Native cleanup could not finish')
    const fallback = vi.fn(async () => undefined).mockRejectedValueOnce(failure)
    const coordinator = new AgentProviderLaunchShutdownCoordinator({ write: vi.fn() })
    const session = { sessionId: 'session', providerLaunchGeneration: 1, isTerminalRunning: true }
    coordinator.trackLaunch(session, 1, {
      inputs: [],
      inputIntervalMs: 0,
      timeoutMs: 0,
      onTimeout: fallback
    })
    await expect(coordinator.request(session)).rejects.toBe(failure)
    await expect(coordinator.request(session)).resolves.toBeUndefined()
    expect(fallback).toHaveBeenCalledTimes(2)
  })
})
