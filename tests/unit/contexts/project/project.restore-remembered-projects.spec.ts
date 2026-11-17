import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import { RestoreRememberedProjectsUseCase } from '../../../../src/contexts/project/application/use-cases/RestoreRememberedProjectsUseCase'
import { SelectCurrentProjectUseCase } from '../../../../src/contexts/project/application/use-cases/SelectCurrentProjectUseCase'
import { ProjectRegistryTransactionCoordinator } from '../../../../src/contexts/project/application/use-cases/ProjectRegistryTransactionCoordinator'
import { createDeferred } from '../../../fixtures/deferred'

describe('remembered project recovery', () => {
  it.each([
    ['/b', ['/a', '/b'], '/b'],
    ['/b', ['/a'], '/a'],
    [null, ['/b', '/a'], '/a'],
    ['/b', [], null]
  ] as const)('recovers %s from loadable directories %j as %s', (current, loaded, expected) => {
    const registry = ProjectRegistry.fromSnapshot({
      projectDirectories: ['/a', '/b'],
      currentProjectDirectory: current
    })
    expect(registry.recoverCurrentProject(loaded).toSnapshot()).toEqual({
      projectDirectories: ['/a', '/b'],
      currentProjectDirectory: expected
    })
  })

  it('skips unavailable projects and persists only the resulting selection', async () => {
    const f = fixture()
    f.loader.load.mockImplementation(async (project) => {
      if (project.directory === '/a') throw new Error('workspace unavailable')
    })
    await expect(f.restore.execute()).resolves.toEqual({
      projectDirectories: ['/b'],
      currentProjectDirectory: '/b'
    })
    expect(f.registry.save).toHaveBeenCalledOnce()
    expect(f.projects.save).not.toHaveBeenCalled()
  })

  it('does not hold the registry transaction during workspace loading or overwrite newer selection', async () => {
    const f = fixture()
    const entered = createDeferred<void>()
    const gate = createDeferred<void>()
    f.loader.load.mockImplementationOnce(async () => {
      entered.resolve()
      await gate.promise
    })
    const restoration = f.restore.execute()
    await entered.promise
    await new SelectCurrentProjectUseCase(f.registry, f.transactions).execute({ directory: '/b' })
    gate.resolve()
    await expect(restoration).resolves.toMatchObject({ currentProjectDirectory: '/b' })
    expect(f.registry.save).toHaveBeenCalledOnce()
  })

  it('does not restore a project removed from the registry while loading', async () => {
    const f = fixture()
    f.loader.load.mockImplementationOnce(async () => {
      await f.transactions.run(async () => {
        await f.registry.save(
          ProjectRegistry.fromSnapshot(await f.registry.get()).forgetProject('/a')
        )
      })
    })
    await expect(f.restore.execute()).resolves.toEqual({
      projectDirectories: ['/b'],
      currentProjectDirectory: '/b'
    })
    expect((await f.registry.get()).projectDirectories).toEqual(['/b'])
  })

  it('waits for an in-flight registry write before reading its initial snapshot', async () => {
    const f = fixture()
    const entered = createDeferred<void>()
    const gate = createDeferred<void>()
    const write = f.transactions.run(async () => {
      entered.resolve()
      await gate.promise
    })
    await entered.promise
    const restoration = f.restore.execute()
    try {
      expect(f.registry.get).not.toHaveBeenCalled()
    } finally {
      gate.resolve()
      await write
      await restoration
    }
  })

  it('returns the latest registry order after a reorder during loading', async () => {
    const f = fixture()
    f.loader.load.mockImplementationOnce(async () => {
      await f.transactions.run(async () => {
        await f.registry.save(
          ProjectRegistry.fromSnapshot(await f.registry.get()).moveProjectBefore('/b', '/a')
        )
      })
    })
    await expect(f.restore.execute()).resolves.toEqual({
      projectDirectories: ['/b', '/a'],
      currentProjectDirectory: '/a'
    })
  })
})

function fixture() {
  let snapshot = ProjectRegistry.fromSnapshot({
    projectDirectories: ['/a', '/b'],
    currentProjectDirectory: '/a'
  }).toSnapshot()
  const projects = {
    findByDirectory: vi.fn(async (directory: string): Promise<ProjectSnapshot> => ({
      id: directory,
      directory,
      name: directory,
      workspaces: []
    })),
    save: vi.fn()
  }
  const registry = {
    get: vi.fn(async () => snapshot),
    save: vi.fn(async (value: ProjectRegistry) => {
      snapshot = value.toSnapshot()
    })
  }
  const loader = {
    load: vi.fn(async (project: ProjectSnapshot) => {
      void project
    })
  }
  const transactions = new ProjectRegistryTransactionCoordinator()
  const restore = new RestoreRememberedProjectsUseCase(
    projects,
    registry,
    { execute: async ({ directory }) => projects.findByDirectory(directory) },
    loader,
    transactions
  )
  return { projects, registry, loader, transactions, restore }
}
