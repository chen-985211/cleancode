import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { NodeAgentExecutionDirectoryAdapter } from '../../../../src/contexts/agent/infrastructure/filesystem/NodeAgentExecutionDirectoryAdapter'

const exec = promisify(execFile)

describe('Agent execution directory validation', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cc-agent-directory-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('accepts attached and detached worktrees but rejects missing or unrelated repositories', async () => {
    const home = join(root, 'home')
    const linked = join(root, "linked 中文'worktree")
    const unrelated = join(root, 'unrelated')
    await mkdir(home)
    await exec('git', ['init', '-b', 'main'], { cwd: home })
    await exec(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '--allow-empty',
        '-m',
        'initial'
      ],
      { cwd: home }
    )
    await exec('git', ['worktree', 'add', '--detach', linked], { cwd: home })
    await mkdir(unrelated)
    await exec('git', ['init'], { cwd: unrelated })
    const adapter = new NodeAgentExecutionDirectoryAdapter()
    await expect(
      adapter.resolve({ workspaceDirectory: home, executionDirectory: linked })
    ).resolves.toBe(await realpath(linked))
    await expect(
      adapter.resolve({ workspaceDirectory: home, executionDirectory: unrelated })
    ).resolves.toBeNull()
    await expect(
      adapter.resolve({ workspaceDirectory: home, executionDirectory: join(root, 'missing') })
    ).resolves.toBeNull()
    await expect(
      adapter.resolve({ workspaceDirectory: linked, executionDirectory: home })
    ).resolves.toBe(await realpath(home))
  })
})
