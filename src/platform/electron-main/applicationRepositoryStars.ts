import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { applicationRepository } from '../ipc/applicationRepositoryChannels'

const cacheDurationMs = 10 * 60 * 1000
const requestTimeoutMs = 5000

export function createApplicationRepositoryStarsReader({
  request = fetch,
  now = Date.now
}: {
  readonly request?: typeof fetch
  readonly now?: () => number
} = {}): () => Promise<number> {
  let cached: { readonly count: number; readonly expiresAt: number } | null = null
  let pending: Promise<number> | null = null

  return () => {
    if (cached && now() < cached.expiresAt) return Promise.resolve(cached.count)
    if (pending) return pending

    pending = queryRepositoryStars(request)
      .then((count) => {
        cached = { count, expiresAt: now() + cacheDurationMs }
        return count
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
}

async function queryRepositoryStars(request: typeof fetch): Promise<number> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await request(`https://api.github.com/repos/${applicationRepository}`, {
      headers: { Accept: 'application/vnd.github+json' },
      redirect: 'error',
      signal: controller.signal
    })
    if (!response.ok) throw new Error('Repository metadata request failed.')
    const body: unknown = await response.json()
    const count =
      typeof body === 'object' && body !== null && 'stargazers_count' in body
        ? body.stargazers_count
        : undefined
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid repository star count.')
    }
    return count
  } catch {
    throw createExpectedAppError(
      'GITHUB_REQUEST_FAILED',
      'Application repository stars are unavailable.'
    )
  } finally {
    clearTimeout(timeout)
  }
}
