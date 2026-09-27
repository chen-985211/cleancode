import { GitCliIssueBaseAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliIssueBaseAdapter'
import { runGit } from '../../../../src/contexts/project/infrastructure/filesystem/GitProcess'

vi.mock('../../../../src/contexts/project/infrastructure/filesystem/GitProcess', () => ({
  runGit: vi.fn()
}))

const sha = 'a'.repeat(40)
const nextSha = 'b'.repeat(40)
const git = vi.mocked(runGit)

describe('issue workspace base resolution', () => {
  beforeEach(() => {
    git.mockReset()
  })

  it('creates from an existing local branch without any network query', async () => {
    git.mockImplementation(async (_directory, args) => {
      if (args[0] === 'check-ref-format') return ''
      if (args[0] === 'rev-parse' && args.includes('refs/heads/main^{commit}')) return sha
      throw new Error('Network unavailable')
    })
    await expect(
      new GitCliIssueBaseAdapter().resolve('/project', 'owner/repo', 'main')
    ).resolves.toBe(sha)
    expect(
      git.mock.calls.some(([, args]) => args.includes('fetch') || args.includes('ls-remote'))
    ).toBe(false)
  })

  it('expires remote results, retries failures and isolates project directories', async () => {
    let now = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    let fail = false
    git.mockImplementation(async (_directory, args) => {
      if (args[0] === 'check-ref-format') return ''
      if (args[0] === 'remote' && args.length === 1) return 'origin'
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git'
      if (args[0] === 'rev-parse' && args.includes('refs/heads/origin/main^{commit}'))
        throw new Error('Missing local branch')
      if (args.includes('fetch')) {
        if (fail) throw new Error('private failure')
        return ''
      }
      return sha
    })
    try {
      const adapter = new GitCliIssueBaseAdapter()
      await adapter.resolve('/one', 'owner/repo', 'origin/main')
      await adapter.resolve('/two', 'owner/repo', 'origin/main')
      expect(git.mock.calls.filter(([, args]) => args.includes('fetch'))).toHaveLength(2)
      now = 30_001
      fail = true
      await expect(adapter.resolve('/one', 'owner/repo', 'origin/main')).rejects.toMatchObject({
        code: 'GITHUB_BASE_UNAVAILABLE'
      })
      fail = false
      await expect(adapter.resolve('/one', 'owner/repo', 'origin/main')).resolves.toBe(sha)
      expect(git.mock.calls.filter(([, args]) => args.includes('fetch'))).toHaveLength(4)
    } finally {
      clock.mockRestore()
    }
  })

  it('shares a pending remote refresh and reuses its successful result', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    let current = sha
    git.mockImplementation(async (_directory, args) => {
      if (args[0] === 'check-ref-format') return ''
      if (args[0] === 'remote' && args.length === 1) return 'origin\n'
      if (args[0] === 'remote') return 'https://github.com/owner/repo.git'
      if (args[0] === 'rev-parse' && args.includes('refs/heads/origin/main^{commit}'))
        throw new Error('Missing local branch')
      if (args.includes('fetch')) {
        await pending
        current = nextSha
        return ''
      }
      if (args[0] === 'rev-parse') return current
      throw new Error('Unexpected Git command')
    })
    const adapter = new GitCliIssueBaseAdapter()
    const first = adapter
      .resolve('/project', 'owner/repo', 'origin/main')
      .catch((error: unknown) => error)
    const second = adapter
      .resolve('/project', 'owner/repo', 'origin/main')
      .catch((error: unknown) => error)
    await vi.waitFor(() =>
      expect(git.mock.calls.filter(([, args]) => args.includes('fetch'))).toHaveLength(1)
    )
    finish()
    await expect(Promise.all([first, second])).resolves.toEqual([nextSha, nextSha])
    await expect(adapter.resolve('/project', 'owner/repo', 'origin/main')).resolves.toBe(nextSha)
    expect(git.mock.calls.filter(([, args]) => args.includes('fetch'))).toHaveLength(1)
  })
})
