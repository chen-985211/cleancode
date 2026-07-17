import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import type { ProjectRegistryRepository } from '../../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import type { WorkspaceAgentLifecyclePort } from '../../../../src/contexts/project/application/ports/WorkspaceAgentLifecyclePort'
import { ForgetProjectUseCase } from '../../../../src/contexts/project/application/use-cases/ForgetProjectUseCase'
import { ListRememberedProjectsUseCase } from '../../../../src/contexts/project/application/use-cases/ListRememberedProjectsUseCase'
import { ProjectRegistryTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { ProjectWorkspaceTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectWorkspaceTransactionCoordinator'
import { RememberProjectUseCase } from '../../../../src/contexts/project/application/use-cases/RememberProjectUseCase'

describe('project registry', () => {
  it('remembers project directories without duplicates and keeps the newest project first', async () => {
    const repository = new InMemoryProjectRegistryRepository()
    const rememberProject = new RememberProjectUseCase(repository)
    const listRememberedProjects = new ListRememberedProjectsUseCase(repository)

    await rememberProject.execute({ directory: '/work/alpha' })
    await rememberProject.execute({ directory: '/work/beta' })
    await rememberProject.execute({ directory: '/work/alpha' })

    expect(await listRememberedProjects.execute()).toEqual({
      projectDirectories: ['/work/alpha', '/work/beta']
    })
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

    expect(await repository.get()).toEqual({ projectDirectories: ['/work/gamma'] })
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
      projectDirectories: ['/work/gamma', '/work/beta']
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

  constructor(projectDirectories: readonly string[]) {
    this.registry = ProjectRegistry.fromSnapshot({ projectDirectories })
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
