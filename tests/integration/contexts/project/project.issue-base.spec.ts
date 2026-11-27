import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitCliIssueBaseAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliIssueBaseAdapter'

import { GitCliWorkspaceBaseAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliWorkspaceBaseAdapter'

const exec = promisify(execFile)
const git = async (cwd: string, ...args: string[]) =>
  (
    await exec('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  ).stdout.trim()

describe('real Git workspace base resolution', () => {
  let root: string
  let source: string
  let checkout: string
  let original: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cleancode-issue-base-'))
    source = join(root, 'source')
    checkout = join(root, 'checkout')
    await git(root, 'init', '-b', 'main', source)
    await git(
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Initial'
    )
    original = await git(source, 'rev-parse', 'HEAD')
    await git(root, 'clone', source, checkout)
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it.each([
    '+refs/heads/release/*:refs/remotes/origin/*',
    '+refs/heads/release/stable:refs/remotes/origin/stable',
    '+refs/heads/release/st*:refs/remotes/origin/st*'
  ])('refreshes the selected tracking ref using its configured source %s', async (spec) => {
    await git(source, 'branch', 'stable')
    await git(source, 'switch', '-c', 'release/stable')
    await git(checkout, 'config', '--replace-all', 'remote.origin.fetch', spec)
    await git(checkout, 'fetch', 'origin')
    await git(
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Release'
    )
    const expected = await git(source, 'rev-parse', 'HEAD')
    const ref = 'refs/remotes/origin/stable'
    expect(await git(checkout, 'rev-parse', ref)).toBe(original)
    expect(await new GitCliWorkspaceBaseAdapter().resolve(checkout, ref)).toBe(expected)
    expect(await git(checkout, 'rev-parse', ref)).toBe(expected)
    expect(await git(checkout, 'rev-parse', 'main')).toBe(original)
  })

  it('rejects a stale tracking ref that the configured fetch excludes', async () => {
    await git(checkout, 'config', '--add', 'remote.origin.fetch', '^refs/heads/main')
    await expect(
      new GitCliWorkspaceBaseAdapter().resolve(checkout, 'refs/remotes/origin/main')
    ).rejects.toMatchObject({ code: 'GIT_WORKSPACE_BASE_UNAVAILABLE' })
  })

  it('refreshes only the selected tracking ref when the remote has additional fetch destinations', async () => {
    await git(checkout, 'branch', 'mirror-main')
    await git(
      checkout,
      'config',
      '--add',
      'remote.origin.fetch',
      '+refs/heads/main:refs/heads/mirror-main'
    )
    await git(
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Upstream change'
    )
    const upstream = await git(source, 'rev-parse', 'main')
    expect(
      await new GitCliWorkspaceBaseAdapter().resolve(checkout, 'refs/remotes/origin/main')
    ).toBe(upstream)
    expect(await git(checkout, 'rev-parse', 'refs/remotes/origin/main')).toBe(upstream)
    expect(await git(checkout, 'rev-parse', 'refs/heads/mirror-main')).toBe(original)
  })

  it.each(['excluded', 'ambiguous', 'unmapped'] as const)(
    'skips the cached default when its source is %s, even with no local branch',
    async (kind) => {
      await git(source, 'branch', 'release')
      await git(checkout, 'fetch', 'origin')
      await git(checkout, 'switch', '--detach')
      await git(checkout, 'branch', '-D', 'main')
      if (kind === 'unmapped')
        await git(
          checkout,
          'config',
          '--replace-all',
          'remote.origin.fetch',
          '+refs/heads/release:refs/remotes/origin/release'
        )
      else
        await git(
          checkout,
          'config',
          '--add',
          'remote.origin.fetch',
          kind === 'excluded' ? '^refs/heads/main' : '+refs/heads/other:refs/remotes/origin/main'
        )
      await git(checkout, 'remote', 'set-url', 'origin', join(root, 'offline'))
      const adapter = new GitCliWorkspaceBaseAdapter()
      const release = 'refs/remotes/origin/release'
      expect(await adapter.list(checkout, null)).toEqual({
        branches: [release],
        defaultBranch: release
      })
      await git(checkout, 'config', '--unset-all', 'remote.origin.fetch')
      expect(await adapter.list(checkout, null)).toEqual({ branches: [], defaultBranch: null })
    }
  )

  it('uses the remote owning the fetch destination, even under a different name', async () => {
    const ref = 'refs/remotes/releases/stable'
    await git(checkout, 'config', '--add', 'remote.origin.fetch', `+refs/heads/main:${ref}`)
    expect(await new GitCliWorkspaceBaseAdapter().resolve(checkout, ref)).toBe(original)
    expect(await git(checkout, 'rev-parse', ref)).toBe(original)
  })

  it('rejects conflicting sources without changing the existing tracking ref', async () => {
    await git(
      checkout,
      'config',
      '--add',
      'remote.origin.fetch',
      '+refs/heads/other:refs/remotes/origin/main'
    )
    await expect(
      new GitCliWorkspaceBaseAdapter().resolve(checkout, 'refs/remotes/origin/main')
    ).rejects.toMatchObject({ code: 'GIT_WORKSPACE_BASE_UNAVAILABLE' })
    expect(await git(checkout, 'rev-parse', 'origin/main')).toBe(original)
  })

  it('offers no bases in an ordinary project directory and propagates filesystem errors', async () => {
    const adapter = new GitCliWorkspaceBaseAdapter()
    await expect(adapter.list(root, null)).resolves.toEqual({ branches: [], defaultBranch: null })
    await expect(adapter.list(join(root, 'missing'), null)).rejects.toThrow()
  })

  it('offers only the remote default and active local workspace among unrelated branches', async () => {
    await git(checkout, 'branch', 'feature/login')
    await git(checkout, 'branch', '3')
    await git(source, 'branch', 'experiment')
    await git(checkout, 'fetch', 'origin')
    await git(
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'New upstream commit'
    )
    const latest = await git(source, 'rev-parse', 'HEAD')
    const adapter = new GitCliWorkspaceBaseAdapter()
    const choices = await adapter.list(checkout, 'feature/login')
    expect(choices.defaultBranch).toBe('refs/remotes/origin/main')
    expect(choices.branches).toEqual(['refs/remotes/origin/main', 'refs/heads/feature/login'])
    expect((await adapter.list(checkout, null)).branches).toEqual([
      'refs/remotes/origin/main',
      'refs/heads/main'
    ])
    expect(await git(checkout, 'rev-parse', 'origin/main')).toBe(original)
    const commit = await adapter.resolve(checkout, choices.defaultBranch!)
    await git(checkout, 'worktree', 'add', '-b', 'test/login-api', join(root, 'task'), commit)
    expect(await git(join(root, 'task'), 'rev-parse', 'HEAD')).toBe(latest)
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(original)
    await git(checkout, 'remote', 'set-url', 'origin', join(root, 'missing'))
    await expect(adapter.resolve(checkout, 'refs/remotes/origin/main')).rejects.toMatchObject({
      code: 'GIT_WORKSPACE_BASE_UNAVAILABLE'
    })
    expect(await adapter.resolve(checkout, 'refs/heads/main')).toBe(original)
    await git(checkout, 'remote', 'remove', 'origin')
    expect(await adapter.list(checkout, 'feature/login')).toEqual({
      branches: ['refs/heads/feature/login'],
      defaultBranch: 'refs/heads/feature/login'
    })
  })

  it('shows the available remote alone, then no choices when there are no branch refs', async () => {
    const adapter = new GitCliWorkspaceBaseAdapter()
    await git(checkout, 'switch', '--detach')
    await git(checkout, 'branch', '-d', 'main')
    expect(await adapter.list(checkout, null)).toEqual({
      branches: ['refs/remotes/origin/main'],
      defaultBranch: 'refs/remotes/origin/main'
    })
    await git(checkout, 'remote', 'remove', 'origin')
    expect(await adapter.list(checkout, null)).toEqual({ branches: [], defaultBranch: null })
  })

  it('creates from a local branch with an unreachable remote and preserves the source checkout', async () => {
    await git(checkout, 'remote', 'set-url', 'origin', join(root, 'missing'))
    const adapter = new GitCliIssueBaseAdapter()
    const commit = await adapter.resolve(checkout, 'owner/repo', 'main')
    expect(commit).toBe(original)
    expect(await adapter.resolve(checkout, 'owner/repo', original)).toBe(original)
    const worktree = join(root, 'task')
    await git(checkout, 'worktree', 'add', '-b', 'issue/42', worktree, commit)
    expect(await git(worktree, 'rev-parse', 'HEAD')).toBe(original)
    expect(await git(checkout, 'branch', '--show-current')).toBe('main')
    expect(await git(checkout, 'status', '--porcelain')).toBe('')
  })

  it('refreshes an explicit remote base without moving the local branch or creating a worktree', async () => {
    await git(
      source,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--allow-empty',
      '-m',
      'Next'
    )
    const latest = await git(source, 'rev-parse', 'HEAD')
    const adapter = new GitCliIssueBaseAdapter()
    expect(await adapter.resolve(checkout, 'owner/repo', 'origin/main')).toBe(latest)
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(original)
    expect(await git(checkout, 'rev-parse', 'refs/remotes/origin/main')).toBe(latest)
    expect(
      (await git(checkout, 'worktree', 'list', '--porcelain')).match(/^worktree /gm)
    ).toHaveLength(1)
    await expect(adapter.resolve(checkout, 'owner/repo', 'origin/missing')).rejects.toMatchObject({
      code: 'GITHUB_BASE_UNAVAILABLE'
    })
  })
})
