import { createApplicationRepositoryStarsReader } from '../../../src/platform/electron-main/applicationRepositoryStars'

describe('application repository stars query', () => {
  it.each([0, 3200, Number.MAX_SAFE_INTEGER])(
    'accepts the real non-negative integer %s',
    async (count) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ stargazers_count: count }))
      const read = createApplicationRepositoryStarsReader({ request })
      await expect(read()).resolves.toBe(count)
      expect(request).toHaveBeenCalledWith(
        'https://api.github.com/repos/chen-985211/cleancode',
        expect.objectContaining({
          headers: { Accept: 'application/vnd.github+json' },
          redirect: 'error',
          signal: expect.any(AbortSignal)
        })
      )
    }
  )

  it.each([-1, 1.5, '3200', null, undefined, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counts (%s) without caching them',
    async (count) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(Response.json({ stargazers_count: count }))
        .mockResolvedValueOnce(Response.json({ stargazers_count: 8 }))
      const read = createApplicationRepositoryStarsReader({ request })
      await expect(read()).rejects.toMatchObject({ code: 'GITHUB_REQUEST_FAILED' })
      await expect(read()).resolves.toBe(8)
      expect(request).toHaveBeenCalledTimes(2)
    }
  )

  it.each([403, 404, 429, 500])(
    'rejects HTTP %s without exposing the response body',
    async (status) => {
      const read = createApplicationRepositoryStarsReader({
        request: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('secret response', { status }))
      })
      await expect(read()).rejects.toMatchObject({
        code: 'GITHUB_REQUEST_FAILED',
        isExpected: true
      })
    }
  )

  it('coalesces concurrent queries and refreshes only after the successful cache expires', async () => {
    let timestamp = 1000
    let complete: (response: Response) => void = () => undefined
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          })
      )
      .mockResolvedValueOnce(Response.json({ stargazers_count: 9 }))
    const read = createApplicationRepositoryStarsReader({ request, now: () => timestamp })
    const first = read()
    const concurrent = read()
    complete(Response.json({ stargazers_count: 8 }))
    await expect(Promise.all([first, concurrent])).resolves.toEqual([8, 8])
    await expect(read()).resolves.toBe(8)
    expect(request).toHaveBeenCalledOnce()
    timestamp += 10 * 60 * 1000
    await expect(read()).resolves.toBe(9)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('clears its timeout after success and bounds a stalled request', async () => {
    vi.useFakeTimers()
    try {
      const request = vi.fn<typeof fetch>().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true
            })
          })
      )
      const read = createApplicationRepositoryStarsReader({ request })
      const result = expect(read()).rejects.toMatchObject({ code: 'GITHUB_REQUEST_FAILED' })
      await vi.advanceTimersByTimeAsync(5000)
      await result
      expect(vi.getTimerCount()).toBe(0)
      request.mockResolvedValueOnce(Response.json({ stargazers_count: 5 }))
      await expect(read()).resolves.toBe(5)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
