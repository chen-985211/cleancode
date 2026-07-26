import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { FileSystemBranchWorkspaceDirectoryResolver } from '../../../../src/contexts/project/infrastructure/filesystem/FileSystemBranchWorkspaceDirectoryResolver'
import { CreateOrOpenProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import { FileSystemProjectRepository } from '../../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { GitCliWorkspaceAdapter } from '../../../../src/contexts/project/infrastructure/filesystem/GitCliWorkspaceAdapter'

const execFileAsync = promisify(execFile)

describe('project git workspace adapter', () => {
  let projectDirectory: string
  let appStateDirectory: string

  beforeEach(async () => {
    projectDirectory = await mkdtemp(join(tmpdir(), 'cleancode-git-project-'))
    appStateDirectory = await mkdtemp(join(tmpdir(), 'cleancode-git-state-'))
  })

  afterEach(async () => {
    await rm(projectDirectory, { recursive: true, force: true })
    await rm(appStateDirectory, { recursive: true, force: true })
  })

  it('reports a non-git project without a branch binding', async () => {
    const adapter = new GitCliWorkspaceAdapter()

    await expect(adapter.inspectRepository(projectDirectory)).resolves.toEqual({
      isGitRepository: false,
      currentBranch: null,
      localBranches: [],
      branches: []
    })
  })

  it('propagates an inspection failure instead of reporting a missing directory as non-git', async () => {
    const adapter = new GitCliWorkspaceAdapter()

    await expect(
      adapter.inspectRepository(join(projectDirectory, 'missing'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('inspects local branches and creates an isolated branch worktree', async () => {
    const adapter = new GitCliWorkspaceAdapter()
    const worktreeDirectory = join(appStateDirectory, 'feature-sidebar')
    const canonicalProjectDirectory = await realpath(projectDirectory)

    await initializeGitProject(projectDirectory)
    await expect(adapter.inspectRepository(projectDirectory)).resolves.toEqual({
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['main'],
      branches: [
        {
          name: 'main',
          worktreeDirectory: canonicalProjectDirectory,
          isCurrent: true,
          isLocked: false,
          lockReason: null
        }
      ]
    })

    await adapter.createBranchWorktree({
      repositoryDirectory: projectDirectory,
      branchName: 'feature/sidebar',
      worktreeDirectory
    })

    await access(join(worktreeDirectory, '.git'))
    const canonicalWorktreeDirectory = await realpath(worktreeDirectory)
    await writeFile(join(worktreeDirectory, 'branch.txt'), 'feature sidebar\n')
    expect(await readFile(join(projectDirectory, 'README.md'), 'utf8')).toBe('hello\n')
    await expect(readFile(join(projectDirectory, 'branch.txt'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(getCurrentBranch(worktreeDirectory)).resolves.toBe('feature/sidebar')
    await expect(adapter.inspectRepository(projectDirectory)).resolves.toEqual({
      isGitRepository: true,
      currentBranch: 'main',
      localBranches: ['feature/sidebar', 'main'],
      branches: [
        {
          name: 'feature/sidebar',
          worktreeDirectory: canonicalWorktreeDirectory,
          isCurrent: false,
          isLocked: false,
          lockReason: null
        },
        {
          name: 'main',
          worktreeDirectory: canonicalProjectDirectory,
          isCurrent: true,
          isLocked: false,
          lockReason: null
        }
      ]
    })
  })

  it('inspects, unlocks, and restores a worktree lock reason', async () => {
    const adapter = new GitCliWorkspaceAdapter()
    const worktreeDirectory = join(appStateDirectory, 'feature-sidebar')

    await initializeGitProject(projectDirectory)
    await adapter.createBranchWorktree({
      repositoryDirectory: projectDirectory,
      branchName: 'feature/sidebar',
      worktreeDirectory
    })
    await execFileAsync(
      'git',
      ['worktree', 'lock', '--reason', 'external agent session', worktreeDirectory],
      { cwd: projectDirectory }
    )

    const lockedInspection = await adapter.inspectRepository(projectDirectory)
    expect(
      lockedInspection.branches.find((branch) => branch.name === 'feature/sidebar')
    ).toMatchObject({
      name: 'feature/sidebar',
      isLocked: true,
      lockReason: 'external agent session'
    })

    await adapter.unlockBranchWorktree({
      repositoryDirectory: projectDirectory,
      worktreeDirectory
    })
    const unlockedInspection = await adapter.inspectRepository(projectDirectory)
    expect(
      unlockedInspection.branches.find((branch) => branch.name === 'feature/sidebar')
    ).toMatchObject({
      name: 'feature/sidebar',
      isLocked: false,
      lockReason: null
    })

    await adapter.lockBranchWorktree({
      repositoryDirectory: projectDirectory,
      worktreeDirectory,
      reason: 'external agent session'
    })
    const restoredInspection = await adapter.inspectRepository(projectDirectory)
    expect(
      restoredInspection.branches.find((branch) => branch.name === 'feature/sidebar')
    ).toMatchObject({
      name: 'feature/sidebar',
      isLocked: true,
      lockReason: 'external agent session'
    })

    await adapter.unlockBranchWorktree({
      repositoryDirectory: projectDirectory,
      worktreeDirectory
    })
  })

  it('checks out a local branch in a clean main worktree', async () => {
    const adapter = new GitCliWorkspaceAdapter()

    await initializeGitProject(projectDirectory)
    await execFileAsync('git', ['branch', 'feature/free'], { cwd: projectDirectory })
    await expect(adapter.isWorkingTreeClean(projectDirectory)).resolves.toBe(true)

    await adapter.checkoutBranch({
      repositoryDirectory: projectDirectory,
      branchName: 'feature/free'
    })

    await expect(getCurrentBranch(projectDirectory)).resolves.toBe('feature/free')
    await writeFile(join(projectDirectory, 'dirty.txt'), 'dirty\n')
    await expect(adapter.isWorkingTreeClean(projectDirectory)).resolves.toBe(false)
  })

  it('synchronizes the stored main workspace branch after an external checkout', async () => {
    const repository = new FileSystemProjectRepository(appStateDirectory)
    const adapter = new GitCliWorkspaceAdapter()
    const createOrOpenProject = new CreateOrOpenProjectUseCase(repository, adapter)
    const synchronizeProjectGitState = new SynchronizeProjectGitStateUseCase(repository, adapter)

    await initializeGitProject(projectDirectory)
    await execFileAsync('git', ['branch', 'feature/free'], { cwd: projectDirectory })
    await createOrOpenProject.execute({
      directory: projectDirectory,
      name: 'app'
    })

    await execFileAsync('git', ['checkout', 'feature/free'], { cwd: projectDirectory })
    const project = await synchronizeProjectGitState.execute({ projectDirectory })

    expect(project?.workspaces[0]).toMatchObject({
      workspaceId: expect.any(String),
      workspaceKind: 'default',
      displayName: 'main',
      directory: projectDirectory,
      gitBranch: 'feature/free',
      isCurrent: true
    })
    await expect(repository.findByDirectory(projectDirectory)).resolves.toMatchObject({
      workspaces: [
        {
          workspaceId: project?.workspaces[0]?.workspaceId,
          workspaceKind: 'default',
          displayName: 'main',
          directory: projectDirectory,
          gitBranch: 'feature/free',
          isCurrent: true
        }
      ]
    })
  })

  it('removes a branch worktree without deleting the git branch', async () => {
    const adapter = new GitCliWorkspaceAdapter()
    const worktreeDirectory = join(appStateDirectory, 'feature-sidebar')

    await initializeGitProject(projectDirectory)
    await adapter.createBranchWorktree({
      repositoryDirectory: projectDirectory,
      branchName: 'feature/sidebar',
      worktreeDirectory
    })

    await adapter.removeBranchWorktree({
      repositoryDirectory: projectDirectory,
      worktreeDirectory
    })
    await adapter.pruneWorktrees({
      repositoryDirectory: projectDirectory
    })

    await expect(access(worktreeDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(listLocalBranches(projectDirectory)).resolves.toContain('feature/sidebar')
  })

  it('resolves branch worktree directories inside a centralized sibling worktrees directory', () => {
    const resolver = new FileSystemBranchWorkspaceDirectoryResolver()

    expect(
      resolver.resolveBranchWorkspaceDirectory({
        projectDirectory,
        branchName: 'feature/sidebar'
      })
    ).toBe(
      join(dirname(projectDirectory), 'worktrees', basename(projectDirectory), 'feature', 'sidebar')
    )
  })
})

async function initializeGitProject(directory: string): Promise<void> {
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: directory })
  await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: directory })
  await writeFile(join(directory, 'README.md'), 'hello\n')
  await execFileAsync('git', ['add', 'README.md'], { cwd: directory })
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: directory })
}

async function getCurrentBranch(directory: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: directory })

  return stdout.trim()
}

async function listLocalBranches(directory: string): Promise<string[]> {
  const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], {
    cwd: directory
  })

  return stdout
    .split('\n')
    .map((branch) => branch.trim())
    .filter(Boolean)
}
