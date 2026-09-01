import {
  attachTerminalViewWithRetry,
  restoreTerminalViewWithRetry
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalViewAttachment'

describe('terminal view attachment', () => {
  it('abandons a stale identity without retrying it', async () => {
    const onStale = vi.fn()
    const attach = vi.fn().mockRejectedValue(
      Object.assign(new Error('Terminal view no longer matches the current runtime scope.'), {
        code: 'RUN_SCOPE_STALE',
        isExpected: true
      })
    )

    await expect(
      attachTerminalViewWithRetry({
        attach,
        isCancelled: () => false,
        onStale
      })
    ).resolves.toBeNull()
    expect(attach).toHaveBeenCalledOnce()
    expect(onStale).toHaveBeenCalledOnce()
  })

  it('abandons a stale identity after contextBridge strips custom fields', async () => {
    const attach = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Error invoking remote method: Terminal view no longer matches the current runtime scope.'
        )
      )

    await expect(
      attachTerminalViewWithRetry({
        attach,
        isCancelled: () => false
      })
    ).resolves.toBeNull()
    expect(attach).toHaveBeenCalledOnce()
  })

  it('retries a runtime that is not ready yet', async () => {
    const attach = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Terminal runtime is still starting.'), {
          code: 'TERMINAL_RUNTIME_NOT_READY',
          isExpected: true
        })
      )
      .mockResolvedValueOnce('attached')

    await expect(
      attachTerminalViewWithRetry({
        attach,
        isCancelled: () => false
      })
    ).resolves.toBe('attached')
    expect(attach).toHaveBeenCalledTimes(2)
  })

  it('retries a runtime that is not ready after contextBridge strips custom fields', async () => {
    const attach = vi
      .fn()
      .mockRejectedValueOnce(
        new Error('Error invoking remote method: Terminal runtime is still starting.')
      )
      .mockResolvedValueOnce('attached')

    await expect(
      attachTerminalViewWithRetry({
        attach,
        isCancelled: () => false
      })
    ).resolves.toBe('attached')
    expect(attach).toHaveBeenCalledTimes(2)
  })

  it('does not retry an unexpected attachment failure', async () => {
    const failure = new Error('Unexpected attachment failure.')
    const attach = vi.fn().mockRejectedValue(failure)

    await expect(
      attachTerminalViewWithRetry({
        attach,
        isCancelled: () => false
      })
    ).rejects.toBe(failure)
    expect(attach).toHaveBeenCalledOnce()
  })

  it('keeps loading snapshots until terminal restoration converges', async () => {
    const loadSnapshot = vi.fn(async () => 'snapshot')
    const restore = vi
      .fn()
      .mockResolvedValueOnce('retry')
      .mockResolvedValueOnce('retry')
      .mockResolvedValueOnce('ready')

    await expect(
      restoreTerminalViewWithRetry({
        isCancelled: () => false,
        loadSnapshot,
        restore
      })
    ).resolves.toBe('ready')
    expect(loadSnapshot).toHaveBeenCalledTimes(3)
    expect(restore).toHaveBeenCalledTimes(3)
  })
})
