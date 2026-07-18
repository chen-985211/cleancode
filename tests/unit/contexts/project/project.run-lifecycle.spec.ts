import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../../../../src/contexts/project/application/ports/GitWorkspacePort'
import type { ProjectRegistryRepository } from '../../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { WorkspaceRunLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceRunLifecyclePort'
import { ArchiveBranchWorkspaceUseCase } from '../../../../src/contexts/project/application/use-cases/ArchiveBranchWorkspaceUseCase'
import { CheckoutMainWorkspaceBranchUseCase } from '../../../../src/contexts/project/application/use-cases/CheckoutMainWorkspaceBranchUseCase'
import { CreateOrOpenProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateOrOpenProjectUseCase'
import { ForgetProjectUseCase } from '../../../../src/contexts/project/application/use-cases/ForgetProjectUseCase'
import { SynchronizeProjectGitStateUseCase } from '../../../../src/contexts/project/application/use-cases/SynchronizeProjectGitStateUseCase'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'
import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'

describe('project Run lifecycle', () => {
  it('hard-disposes the main workspace before checkout and releases the start gate on failure', async () => {
    const fixture = createProjectFixture()
    fixture.git.checkoutError = new Error('checkout failed')
    const checkout = new CheckoutMainWorkspaceBranchUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await expect(
      checkout.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })
    ).rejects.toThrow('checkout failed')

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:main',
      'git:checkout:feature/free',
      'run:release:main'
    ])
  })

  it('resolves the main workspace start gate after checkout commits', async () => {
    const fixture = createProjectFixture()
    const checkout = new CheckoutMainWorkspaceBranchUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await checkout.execute({ projectDirectory: '/work/app', branchName: 'feature/free' })

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:main',
      'git:checkout:feature/free',
      'project:save',
      'run:resolve:main'
    ])
  })

  it('holds a worktree start gate until archive commits', async () => {
    const fixture = createProjectFixture(createProjectWithWorktree())
    const archive = new ArchiveBranchWorkspaceUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await archive.execute({
      projectDirectory: '/work/app',
      workspaceName: 'feature/sidebar'
    })

    expect(fixture.calls).toContain('run:dispose-workspace:feature/sidebar')
    expect(fixture.calls.at(-1)).toBe('run:resolve:feature/sidebar')
    expect(fixture.calls.indexOf('run:dispose-workspace:feature/sidebar')).toBeLessThan(
      fixture.calls.indexOf('git:remove-worktree')
    )
  })

  it('hard-disposes every project run before forgetting the registry entry', async () => {
    const calls: string[] = []
    const registry = new InMemoryProjectRegistryRepository(['/work/app'])
    const runLifecycle = createRunLifecycle(calls)
    const forget = new ForgetProjectUseCase(registry, undefined, undefined, undefined, runLifecycle)

    await forget.execute({ directory: '/work/app' })

    expect(calls).toEqual(['run:dispose-project:/work/app', 'run:resolve-project:/work/app'])
    await expect(registry.get()).resolves.toEqual({
      currentProjectDirectory: null,
      projectDirectories: []
    })
  })

  it('resolves stale Run gates after reopening and authoritatively synchronizing a project', async () => {
    const fixture = createProjectFixture()
    const openProject = new CreateOrOpenProjectUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await openProject.execute({ directory: '/work/app', name: 'app' })

    expect(fixture.calls).toEqual(['project:save', 'run:resolve-project-quarantines:/work/app'])
  })

  it('hard-disposes rebound workspaces before reopening saves synchronized state', async () => {
    const fixture = createProjectFixture(createProjectWithWorktree())
    fixture.git.inspection = createReboundGitInspection()
    const openProject = new CreateOrOpenProjectUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await openProject.execute({ directory: '/work/app', name: 'app' })

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:main',
      'run:dispose-workspace:feature/sidebar',
      'project:save',
      'run:resolve:main',
      'run:resolve:feature/sidebar',
      'run:resolve-project-quarantines:/work/app'
    ])
  })

  it('quarantines a removed workspace gate when reopening cannot save synchronized state', async () => {
    const fixture = createProjectFixture(createProjectWithWorktree())
    fixture.git.inspection = createGitInspection(false)
    fixture.projects.saveError = new Error('save failed')
    const openProject = new CreateOrOpenProjectUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await expect(openProject.execute({ directory: '/work/app', name: 'app' })).rejects.toThrow(
      'save failed'
    )

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:feature/sidebar',
      'project:save',
      'run:quarantine:feature/sidebar'
    ])
  })

  it('hard-disposes a worktree removed outside cleancode before saving synchronized state', async () => {
    const fixture = createProjectFixture(createProjectWithWorktree())
    fixture.git.inspection = createGitInspection(false)
    const synchronize = new SynchronizeProjectGitStateUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await synchronize.execute({ projectDirectory: '/work/app' })

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:feature/sidebar',
      'project:save',
      'run:resolve:feature/sidebar',
      'run:resolve-project-quarantines:/work/app'
    ])
  })

  it('quarantines an externally removed worktree gate when synchronized state cannot be saved', async () => {
    const fixture = createProjectFixture(createProjectWithWorktree())
    fixture.git.inspection = createGitInspection(false)
    fixture.projects.saveError = new Error('save failed')
    const synchronize = new SynchronizeProjectGitStateUseCase(
      fixture.projects,
      fixture.git,
      undefined,
      undefined,
      fixture.runLifecycle
    )

    await expect(synchronize.execute({ projectDirectory: '/work/app' })).rejects.toThrow(
      'save failed'
    )

    expect(fixture.calls).toEqual([
      'run:dispose-workspace:feature/sidebar',
      'project:save',
      'run:quarantine:feature/sidebar'
    ])
  })
})

function createProjectFixture(initialProject: ProjectSnapshot = createMainProject()) {
  const calls: string[] = []
  const projects = new InMemoryProjectRepository(initialProject, calls)
  const git = new FakeGitWorkspace(calls)

  return {
    calls,
    git,
    projects,
    runLifecycle: createRunLifecycle(calls)
  }
}

class InMemoryProjectRepository implements ProjectRepository {
  saveError: Error | null = null

  constructor(
    private snapshot: ProjectSnapshot,
    private readonly calls: string[]
  ) {}

  async findByDirectory(): Promise<ProjectSnapshot> {
    return this.snapshot
  }

  async save(project: Project): Promise<void> {
    this.calls.push('project:save')
    if (this.saveError) throw this.saveError
    this.snapshot = project.toSnapshot()
  }
}

class FakeGitWorkspace implements GitWorkspacePort {
  checkoutError: Error | null = null
  inspection = createGitInspection(true)

  constructor(private readonly calls: string[]) {}

  async inspectRepository() {
    return this.inspection
  }

  async isWorkingTreeClean() {
    return true
  }

  async checkoutBranch(command: { readonly branchName: string }) {
    this.calls.push(`git:checkout:${command.branchName}`)
    if (this.checkoutError) throw this.checkoutError
  }

  async createBranchWorktree() {}
  async lockBranchWorktree() {}
  async pruneWorktrees() {}

  async removeBranchWorktree() {
    this.calls.push('git:remove-worktree')
  }

  async unlockBranchWorktree() {}
}

function createRunLifecycle(calls: string[]): WorkspaceRunLifecyclePort {
  return {
    disposeProject: async (projectDirectory) => {
      calls.push(`run:dispose-project:${projectDirectory}`)
      return createLease(calls, `project:${projectDirectory}`)
    },
    disposeWorkspace: async (scope) => {
      calls.push(`run:dispose-workspace:${scope.workspaceName}`)
      return createLease(calls, scope.workspaceName)
    },
    disposeWorkspaces: async (scope) => {
      for (const workspaceName of scope.workspaceNames) {
        calls.push(`run:dispose-workspace:${workspaceName}`)
      }
      return createBatchLease(calls, scope.workspaceNames)
    },
    isWorkspaceQuarantined: () => false,
    resolveProjectQuarantines: (projectDirectory) => {
      calls.push(`run:resolve-project-quarantines:${projectDirectory}`)
    }
  }
}

function createLease(calls: string[], scope: string) {
  return {
    wasQuarantined: false,
    quarantine: () => calls.push(`run:quarantine:${scope}`),
    release: () => calls.push(`run:release:${scope}`),
    resolve: () =>
      calls.push(scope.startsWith('project:') ? `run:resolve-${scope}` : `run:resolve:${scope}`)
  }
}

function createBatchLease(calls: string[], workspaceNames: readonly string[]) {
  return {
    wasQuarantined: false,
    quarantine: () => {
      for (const workspaceName of workspaceNames) calls.push(`run:quarantine:${workspaceName}`)
    },
    release: () => {
      for (const workspaceName of workspaceNames) calls.push(`run:release:${workspaceName}`)
    },
    resolve: () => {
      for (const workspaceName of workspaceNames) calls.push(`run:resolve:${workspaceName}`)
    }
  }
}

class InMemoryProjectRegistryRepository implements ProjectRegistryRepository {
  private registry: ProjectRegistry

  constructor(projectDirectories: readonly string[]) {
    this.registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory: projectDirectories[0] ?? null,
      projectDirectories
    })
  }

  async get() {
    return this.registry.toSnapshot()
  }

  async save(registry: ProjectRegistry) {
    this.registry = registry
  }
}

function createMainProject(): ProjectSnapshot {
  return {
    id: 'project-1',
    directory: '/work/app',
    name: 'app',
    workspaces: [{ name: 'main', directory: '/work/app', gitBranch: 'main', isCurrent: true }]
  }
}

function createProjectWithWorktree(): ProjectSnapshot {
  return {
    ...createMainProject(),
    workspaces: [
      { name: 'main', directory: '/work/app', gitBranch: 'main', isCurrent: true },
      {
        name: 'feature/sidebar',
        directory: '/work/app-sidebar',
        gitBranch: 'feature/sidebar',
        isCurrent: false
      }
    ]
  }
}

function createGitInspection(includeWorktree: boolean) {
  return {
    branches: [
      {
        name: 'main',
        worktreeDirectory: '/work/app',
        isCurrent: true,
        isLocked: false,
        lockReason: null
      },
      {
        name: 'feature/free',
        worktreeDirectory: null,
        isCurrent: false,
        isLocked: false,
        lockReason: null
      },
      ...(includeWorktree
        ? [
            {
              name: 'feature/sidebar',
              worktreeDirectory: '/work/app-sidebar',
              isCurrent: false,
              isLocked: false,
              lockReason: null
            }
          ]
        : [])
    ],
    currentBranch: 'main',
    isGitRepository: true,
    localBranches: ['main', 'feature/free', 'feature/sidebar']
  }
}

function createReboundGitInspection() {
  return {
    branches: [
      {
        name: 'feature/current',
        worktreeDirectory: '/work/app',
        isCurrent: true,
        isLocked: false,
        lockReason: null
      },
      {
        name: 'feature/sidebar',
        worktreeDirectory: '/work/app-sidebar-moved',
        isCurrent: false,
        isLocked: false,
        lockReason: null
      }
    ],
    currentBranch: 'feature/current',
    isGitRepository: true,
    localBranches: ['feature/current', 'feature/sidebar']
  }
}
