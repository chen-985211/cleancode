import { CreateProjectUseCase } from '../../../../src/contexts/project/application/use-cases/CreateProjectUseCase'
import type { ProjectRepository } from '../../../../src/contexts/project/application/ports/ProjectRepository'
import type { ProjectSnapshot } from '../../../../src/contexts/project/application/dto/ProjectSnapshot'
import type { Project } from '../../../../src/contexts/project/domain/aggregates/Project'

class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, ProjectSnapshot>()

  async save(project: Project): Promise<void> {
    this.projects.set(project.directory, project.toSnapshot())
  }

  async findByDirectory(directory: string): Promise<ProjectSnapshot | null> {
    return this.projects.get(directory) ?? null
  }
}

describe('project workbench', () => {
  it('creates a local project with a stable identity and a main branch workspace', async () => {
    const repository = new InMemoryProjectRepository()
    const createProject = new CreateProjectUseCase(repository)

    const project = await createProject.execute({
      directory: '/tmp/cleancode-demo',
      name: 'cleancode-demo'
    })

    expect(project.name).toBe('cleancode-demo')
    expect(project.directory).toBe('/tmp/cleancode-demo')
    expect(project.workspaces).toHaveLength(1)
    expect(project.workspaces[0]).toMatchObject({
      workspaceId: expect.any(String),
      workspaceKind: 'default',
      displayName: 'main',
      directory: '/tmp/cleancode-demo',
      gitBranch: null,
      isCurrent: true
    })
    expect(project.workspaces.map((workspace) => workspace.displayName)).not.toContain('default')
  })

  it('persists a created cleancode project through the project repository', async () => {
    const repository = new InMemoryProjectRepository()
    const createProject = new CreateProjectUseCase(repository)

    const createdProject = await createProject.execute({
      directory: '/tmp/cleancode-demo',
      name: 'cleancode-demo'
    })

    const storedProject = await repository.findByDirectory('/tmp/cleancode-demo')

    expect(storedProject?.id).toBe(createdProject.id)
    expect(storedProject?.name).toBe('cleancode-demo')
    expect(storedProject?.workspaces).toEqual(createdProject.workspaces)
  })
})
