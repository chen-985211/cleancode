import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import type { ProjectRegistryRepository } from '../../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import { ProjectRegistryTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { RememberProjectUseCase } from '../../../../src/contexts/project/application/use-cases/RememberProjectUseCase'
import { ReorderProjectsUseCase } from '../../../../src/contexts/project/application/use-cases/ReorderProjectsUseCase'

describe('project registry reordering', () => {
  it('moves a remembered project before another project without changing the current project', () => {
    const registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory: '/work/beta',
      projectDirectories: ['/work/alpha', '/work/beta', '/work/gamma']
    })

    const reordered = registry.moveProjectBefore('/work/gamma', '/work/alpha')

    expect(reordered.toSnapshot()).toEqual({
      currentProjectDirectory: '/work/beta',
      projectDirectories: ['/work/gamma', '/work/alpha', '/work/beta']
    })
  })

  it('moves a remembered project to the end when no target project is provided', () => {
    const registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/alpha', '/work/beta', '/work/gamma']
    })

    expect(registry.moveProjectBefore('/work/alpha', null).toSnapshot()).toEqual({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/beta', '/work/gamma', '/work/alpha']
    })
  })

  it('keeps the registry unchanged when the project already occupies the requested slot', () => {
    const registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/alpha', '/work/beta', '/work/gamma']
    })

    expect(registry.moveProjectBefore('/work/beta', '/work/gamma')).toBe(registry)
    expect(registry.moveProjectBefore('/work/gamma', null)).toBe(registry)
  })

  it('rejects moving an unremembered project or targeting an unremembered project', () => {
    const registry = ProjectRegistry.fromSnapshot({
      currentProjectDirectory: '/work/alpha',
      projectDirectories: ['/work/alpha', '/work/beta']
    })

    expect(() => registry.moveProjectBefore('/work/missing', '/work/alpha')).toThrow(
      'Cannot reorder an unremembered project.'
    )
    expect(() => registry.moveProjectBefore('/work/alpha', '/work/missing')).toThrow(
      'Cannot reorder before an unremembered project.'
    )
  })
})

describe('reorder projects use case', () => {
  it('persists the reordered registry and returns its snapshot', async () => {
    const repository = new InMemoryProjectRegistryRepository([
      '/work/alpha',
      '/work/beta',
      '/work/gamma'
    ])
    const reorderProjects = new ReorderProjectsUseCase(repository)

    await expect(
      reorderProjects.execute({
        projectDirectory: '/work/gamma',
        beforeProjectDirectory: '/work/alpha'
      })
    ).resolves.toEqual({
      currentProjectDirectory: '/work/beta',
      projectDirectories: ['/work/gamma', '/work/alpha', '/work/beta']
    })
    await expect(repository.get()).resolves.toEqual({
      currentProjectDirectory: '/work/beta',
      projectDirectories: ['/work/gamma', '/work/alpha', '/work/beta']
    })
  })

  it('serializes reorder and remember without losing either registry update', async () => {
    const repository = new BlockingFirstSaveProjectRegistryRepository(['/work/alpha', '/work/beta'])
    const transactions = new ProjectRegistryTransactionCoordinator()
    const reorderProjects = new ReorderProjectsUseCase(repository, transactions)
    const rememberProject = new RememberProjectUseCase(repository, transactions)

    const reorder = reorderProjects.execute({
      projectDirectory: '/work/beta',
      beforeProjectDirectory: '/work/alpha'
    })
    await repository.waitForFirstSave()
    const remember = rememberProject.execute({ directory: '/work/gamma' })
    await flushAsyncOperations()

    expect(repository.readCount).toBe(1)

    repository.releaseFirstSave()
    await Promise.all([reorder, remember])

    await expect(repository.get()).resolves.toEqual({
      currentProjectDirectory: '/work/gamma',
      projectDirectories: ['/work/gamma', '/work/beta', '/work/alpha']
    })
  })
})

class InMemoryProjectRegistryRepository implements ProjectRegistryRepository {
  protected registry: ProjectRegistry

  constructor(
    projectDirectories: readonly string[],
    currentProjectDirectory: string | null = '/work/beta'
  ) {
    this.registry = ProjectRegistry.fromSnapshot({ currentProjectDirectory, projectDirectories })
  }

  async save(registry: ProjectRegistry): Promise<void> {
    this.registry = registry
  }

  async get(): Promise<ReturnType<ProjectRegistry['toSnapshot']>> {
    return this.registry.toSnapshot()
  }
}

class BlockingFirstSaveProjectRegistryRepository extends InMemoryProjectRegistryRepository {
  private readonly firstSaveStarted = createDeferred<void>()
  private readonly continueFirstSave = createDeferred<void>()
  private shouldBlockNextSave = true
  readCount = 0

  override async save(registry: ProjectRegistry): Promise<void> {
    if (this.shouldBlockNextSave) {
      this.shouldBlockNextSave = false
      this.firstSaveStarted.resolve()
      await this.continueFirstSave.promise
    }

    await super.save(registry)
  }

  override async get(): Promise<ReturnType<ProjectRegistry['toSnapshot']>> {
    this.readCount += 1
    return super.get()
  }

  waitForFirstSave(): Promise<void> {
    return this.firstSaveStarted.promise
  }

  releaseFirstSave(): void {
    this.continueFirstSave.resolve()
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

async function flushAsyncOperations(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
