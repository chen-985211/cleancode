import {
  AgentLaunchArtifactDisposalError,
  AgentLaunchArtifactScope
} from '../../../../src/contexts/agent/application/services/AgentLaunchArtifactScope'

describe('Agent launch artifact scope', () => {
  it('disposes in LIFO order and retries only artifacts whose cleanup failed', async () => {
    const order: string[] = []
    const first = vi.fn(async () => {
      order.push('first')
    })
    const retryable = vi
      .fn()
      .mockImplementationOnce(async () => {
        order.push('retryable:failed')
        throw new Error('cleanup failed')
      })
      .mockImplementationOnce(async () => {
        order.push('retryable:completed')
      })
    const last = vi.fn(async () => {
      order.push('last')
    })
    const scope = new AgentLaunchArtifactScope()
    scope.track('first', { dispose: first })
    scope.track('retryable', { dispose: retryable })
    scope.track('last', { dispose: last })

    await expect(scope.dispose()).rejects.toMatchObject({
      failures: [{ label: 'retryable', error: expect.any(Error) }]
    })
    expect(order).toEqual(['last', 'retryable:failed', 'first'])
    expect(scope.isDisposed).toBe(false)

    await scope.dispose()
    await scope.dispose()

    expect(order).toEqual(['last', 'retryable:failed', 'first', 'retryable:completed'])
    expect(first).toHaveBeenCalledTimes(1)
    expect(retryable).toHaveBeenCalledTimes(2)
    expect(last).toHaveBeenCalledTimes(1)
    expect(scope.isDisposed).toBe(true)
  })

  it('coalesces concurrent disposal attempts', async () => {
    let finishDisposal: () => void = () => undefined
    const pendingDisposal = new Promise<void>((resolve) => {
      finishDisposal = resolve
    })
    const dispose = vi.fn(async () => pendingDisposal)
    const scope = new AgentLaunchArtifactScope()
    scope.track('pending', { dispose })

    const first = scope.dispose()
    const second = scope.dispose()
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))

    finishDisposal()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(scope.isDisposed).toBe(true)
  })

  it('attempts every artifact and reports every cleanup failure', async () => {
    const firstFailure = new Error('first cleanup failed')
    const secondFailure = new Error('second cleanup failed')
    const completed = vi.fn(async () => undefined)
    const scope = new AgentLaunchArtifactScope()
    scope.track('first-failure', {
      dispose: async () => {
        throw firstFailure
      }
    })
    scope.track('completed', { dispose: completed })
    scope.track('second-failure', {
      dispose: async () => {
        throw secondFailure
      }
    })

    const error = await scope.dispose().catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(AgentLaunchArtifactDisposalError)
    expect(error).toMatchObject({
      errors: [secondFailure, firstFailure],
      failures: [
        { error: secondFailure, label: 'second-failure' },
        { error: firstFailure, label: 'first-failure' }
      ]
    })
    expect(completed).toHaveBeenCalledTimes(1)
  })

  it('seals ownership before cleanup starts', async () => {
    const scope = new AgentLaunchArtifactScope()
    const artifact = { dispose: vi.fn(async () => undefined) }
    expect(scope.track('owned', artifact)).toBe(artifact)

    scope.seal()

    const error = captureError(() => scope.track('late', artifact))
    expect(error).toMatchObject({ code: 'AGENT_SESSION_INVALID', isExpected: true })
    expect(error).toHaveProperty('message', expect.stringContaining('already sealed'))
    await scope.dispose()
  })
})

function captureError(operation: () => unknown): unknown {
  try {
    operation()
  } catch (error) {
    return error
  }
  throw new Error('Expected operation to fail.')
}
