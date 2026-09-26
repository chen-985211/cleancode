import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { GitCliIssueBaseAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliIssueBaseAdapter'

const exec = promisify(execFile)
const git = async (cwd: string, ...args: string[]) =>
  (
    await exec('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  ).stdout.trim()

describe('real Git issue base resolution', () => {
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
