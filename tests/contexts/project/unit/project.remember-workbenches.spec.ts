import { ProjectRegistry } from '../../../../src/contexts/project/domain/aggregates/ProjectRegistry'
import type { ProjectRegistryRepository } from '../../../../src/contexts/project/application/ports/ProjectRegistryRepository'
import { ListRememberedProjectsUseCase } from '../../../../src/contexts/project/application/use-cases/ListRememberedProjectsUseCase'
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
