import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import type { ProjectRegistryRepository } from '../../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { ForgetProjectUseCase } from '../../../../src/contexts/project/application/use-cases/ForgetProjectUseCase'
import { ListRememberedProjectsUseCase } from '../../../../src/contexts/project/application/use-cases/ListRememberedProjectsUseCase'
import { ProjectRegistryTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { RememberProjectUseCase } from '../../../../src/contexts/project/application/use-cases/RememberProjectUseCase'
import { SelectCurrentProjectUseCase } from '../../../../src/contexts/project/application/use-cases/SelectCurrentProjectUseCase'

describe('project registry', () => {
  it('remembers project directories without duplicates and keeps the newest project first', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const rememberProject = new RememberProjectUseCase(repository)
    const listRememberedProjects = new ListRememberedProjectsUseCase(repository)

    await rememberProject.execute({ directory: '/work/alpha' })
    await rememberProject.execute({ directory: '/work/beta' })
    await rememberProject.execute({ directory: '/work/alpha' })

    expect(await listRememberedProjects.execute()).toEqual({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/alpha', '/work/beta']
    })
  })

  it('falls back to the first remaining project when the current project is forgotten', () => {
    const registry = ProjectRegistry.empty()
      .rememberProject('/work/alpha')
      .rememberProject('/work/beta')
      .forgetProject('/work/beta')

    expect(registry.toSnapshot()).toEqual({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/alpha']
    })
  })

  it('restores legacy registry snapshots without inventing a current project', () => {
    expect(
      ProjectRegistry.fromSnapshot({ projectDirectories: ['/work/alpha'] }).toSnapshot()
    ).toEqual({
      currentProjectDirectory: null,
      projectDirectories: ['/work/alpha']
    })
  })

  it('selects a remembered project without reordering recent projects', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const rememberProject = new RememberProjectUseCase(repository)
    const selectCurrentProject = new SelectCurrentProjectUseCase(repository)

    await rememberProject.execute({ directory: '/work/alpha' })
    await rememberProject.execute({ directory: '/work/beta' })
    await selectCurrentProject.execute({ directory: '/work/alpha' })

    await expect(repository.get()).resolves.toEqual({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/beta', '/work/alpha']
    })
  })

  it('clears the current project when no remembered project is loadable', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const rememberProject = new RememberProjectUseCase(repository)
    const selectCurrentProject = new SelectCurrentProjectUseCase(repository)

    await rememberProject.execute({ directory: '/work/alpha' })
    await selectCurrentProject.execute({ directory: null })

    await expect(repository.get()).resolves.toEqual({
      currentProjectDirectory: null,
      projectDirectories: ['/work/alpha']
    })
  })

  it('rejects selecting a project that is not remembered', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const selectCurrentProject = new SelectCurrentProjectUseCase(repository)

    await expect(
      selectCurrentProject.execute({ directory: '/work/missing' })
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_REMEMBERED' })
  })

  it('forgets a project directory without removing other remembered projects', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const rememberProject = new RememberProjectUseCase(repository)
    const lifecycleCalls: string[] = []
    const lifecycle = {
      disposeProject: vi.fn(async (directory) => {
        lifecycleCalls.push(`dispose:${directory}`)
        return {
          wasQuarantined: false,
          quarantine: () => lifecycleCalls.push(`quarantine:${directory}`),
          release: () => lifecycleCalls.push(`release:${directory}`),
          resolve: () => lifecycleCalls.push(`resolve:${directory}`)
        }
      }),
      disposeWorkspace: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined
      })),
      isWorkspaceQuarantined: vi.fn(() => false),
      resolveProjectQuarantines: vi.fn(),
      suspend: vi.fn(async () => ({
        wasQuarantined: false,
        quarantine: () => undefined,
        release: () => undefined,
        resolve: () => undefined,
        resume: async () => undefined,
        wasSuspended: false
      }))
    } satisfies WorkspaceAgentLifecyclePort
    const forgetProject = new ForgetProjectUseCase(repository, lifecycle)
    const listRememberedProjects = new ListRememberedProjectsUseCase(repository)

    await rememberProject.execute({ directory: '/work/alpha' })
    await rememberProject.execute({ directory: '/work/beta' })
    await rememberProject.execute({ directory: '/work/gamma' })
    await forgetProject.execute({ directory: '/work/beta' })

    expect(await listRememberedProjects.execute()).toEqual({
      currentProjectDirectory: '/work/gamma',
      projectDirectories: ['/work/gamma', '/work/alpha']
    })
    expect(lifecycleCalls).toEqual(['dispose:/work/beta', 'resolve:/work/beta'])
  })

  it('serializes concurrent forgets for different projects without losing registry updates', async () => {
    const repository = new BlockingFirstSaveProjectRegistryRepository([
      '/work/alpha',
      '/work/beta',
      '/work/gamma'
    ])
    const registryTransactions = new ProjectRegistryTransactionCoordinator()
    const workspaceTransactions = new ProjectWorkspaceTransactionCoordinator()
    const forgetAlpha = new ForgetProjectUseCase(
      repository,
      createNoopLifecycle(),
      workspaceTransactions,
      registryTransactions
    )
    const forgetBeta = new ForgetProjectUseCase(
      repository,
      createNoopLifecycle(),
      workspaceTransactions,
      registryTransactions
    )

    const firstForget = forgetAlpha.execute({ directory: '/work/alpha' })
    await repository.waitForFirstSave()
    const secondForget = forgetBeta.execute({ directory: '/work/beta' })
    await flushAsyncOperations()

    expect(repository.readCount).toBe(1)

    repository.releaseFirstSave()
    await Promise.all([firstForget, secondForget])

    expect(await repository.get()).toEqual({
      currentProjectDirectory: null,
      projectDirectories: ['/work/gamma']
    })
  })

  it('serializes remember and forget without losing either registry update', async () => {
    const repository = new BlockingFirstSaveProjectRegistryRepository(['/work/alpha', '/work/beta'])
    const registryTransactions = new ProjectRegistryTransactionCoordinator()
    const rememberProject = new RememberProjectUseCase(repository, registryTransactions)
    const forgetProject = new ForgetProjectUseCase(
      repository,
      createNoopLifecycle(),
      new ProjectWorkspaceTransactionCoordinator(),
      registryTransactions
    )

    const rememberGamma = rememberProject.execute({ directory: '/work/gamma' })
    await repository.waitForFirstSave()
    const forgetAlpha = forgetProject.execute({ directory: '/work/alpha' })
    await flushAsyncOperations()

    expect(repository.readCount).toBe(1)

    repository.releaseFirstSave()
    await Promise.all([rememberGamma, forgetAlpha])

    expect(await repository.get()).toEqual({
      currentProjectDirectory: '/work/gamma',
      projectDirectories: ['/work/gamma', '/work/beta']
    })
  })

  it('serializes current project selection and remember without losing either update', async () => {
    const repository = new BlockingFirstSaveProjectRegistryRepository(
      ['/work/alpha', '/work/beta'],
      '/work/beta'
    )
    const registryTransactions = new ProjectRegistryTransactionCoordinator()
    const selectCurrentProject = new SelectCurrentProjectUseCase(repository, registryTransactions)
    const rememberProject = new RememberProjectUseCase(repository, registryTransactions)

    const selectAlpha = selectCurrentProject.execute({ directory: '/work/alpha' })
    await repository.waitForFirstSave()
    const rememberGamma = rememberProject.execute({ directory: '/work/gamma' })
    await flushAsyncOperations()

    expect(repository.readCount).toBe(1)

    repository.releaseFirstSave()
    await Promise.all([selectAlpha, rememberGamma])

    expect(await repository.get()).toEqual({
      currentProjectDirectory: '/work/gamma',
      projectDirectories: ['/work/gamma', '/work/alpha', '/work/beta']
    })
  })
})

class InMemoryProjectRegistryRepository implements ProjectRegistryRepository {
  private registry = ProjectRegistry.empty()

  async save(registry: ProjectRegistry): Promise<void> {
    this.registry = registry
  }

  async get(): Promise<ReturnType<ProjectRegistry['toSnapshot']>> {
    return this.registry.toSnapshot()
  }
}

class BlockingFirstSaveProjectRegistryRepository implements ProjectRegistryRepository {
  private registry: ProjectRegistry
  private readonly firstSaveStarted = createDeferred<void>()
  private readonly continueFirstSave = createDeferred<void>()
  private shouldBlockNextSave = true
  readCount = 0

  constructor(
    projectDirectories: readonly string[],
    currentProjectDirectory: string | null = null
  ) {
    this.registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory,
      projectDirectories
    })
  }

  async save(registry: ProjectRegistry): Promise<void> {
    if (this.shouldBlockNextSave) {
      this.shouldBlockNextSave = false
      this.firstSaveStarted.resolve()
      await this.continueFirstSave.promise
    }

    this.registry = registry
  }

  async get(): Promise<ReturnType<ProjectRegistry['toSnapshot']>> {
    this.readCount += 1
    return this.registry.toSnapshot()
  }

  waitForFirstSave(): Promise<void> {
    return this.firstSaveStarted.promise
  }

  releaseFirstSave(): void {
    this.continueFirstSave.resolve()
  }
}

function createNoopLifecycle(): WorkspaceAgentLifecyclePort {
  return {
    disposeProject: async () => createNoopLease(),
    disposeWorkspace: async () => createNoopLease(),
    isWorkspaceQuarantined: () => false,
    resolveProjectQuarantines: () => undefined,
    suspend: async () => ({
      ...createNoopLease(),
      resume: async () => undefined,
      wasSuspended: false
    })
  }
}

function createNoopLease() {
  return {
    wasQuarantined: false,
    quarantine: () => undefined,
    release: () => undefined,
    resolve: () => undefined
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function flushAsyncOperations(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}
