import { pollUntilState } from '../../support/e2ePolling'

describe('E2E state polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves only when the observed state satisfies the completion condition', async () => {
    let state: 'ready' | 'starting' = 'starting'
    const result = pollUntilState({
      description: 'runtime becomes ready',
      observe: () => state,
      accept: (observation) => observation === 'ready',
      intervalMs: 10,
      timeoutMs: 100
    })

    await vi.advanceTimersByTimeAsync(9)
    state = 'ready'
    await vi.advanceTimersByTimeAsync(1)

    await expect(result).resolves.toBe('ready')
  })

  it('reports the last observation when the failure deadline expires', async () => {
    const result = pollUntilState({
      description: 'runtime becomes ready',
      observe: () => ({ phase: 'starting' }),
      accept: (observation) => observation.phase === 'ready',
      intervalMs: 10,
      timeoutMs: 20
    })
    const assertion = expect(result).rejects.toThrow(
      'Timed out waiting for runtime becomes ready after 20ms. Last observation: {"phase":"starting"}'
    )

    await vi.advanceTimersByTimeAsync(20)
    await assertion
  })

  it('retries transient observation errors only when the caller explicitly opts in', async () => {
    let attempts = 0
    const result = pollUntilState({
      description: 'Electron window state becomes observable',
      observe: () => {
        attempts += 1
        if (attempts === 1) throw new Error('Execution context was destroyed')
        return 'ready'
      },
      accept: (observation) => observation === 'ready',
      intervalMs: 10,
      retryObservationErrors: true,
      timeoutMs: 100
    })

    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toBe('ready')
    expect(attempts).toBe(2)
  })
})
