import { attachTerminalViewWithRetry } from '../../../src/presentation/app-shell/terminalViewAttachment'

describe('terminal view attachment', () => {
  it('retries a transient stale-scope failure', async () => {
    const attach = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Terminal view scope is still starting.'), {
          code: 'RUN_SCOPE_STALE',
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
})
