import { Project } from '../../domain/aggregates/Project'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface CreateProjectCommand {
  readonly directory: string
  readonly name: string
}

export class CreateProjectUseCase {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async execute(command: CreateProjectCommand): Promise<ProjectSnapshot> {
    const project = Project.create({
      directory: command.directory,
      name: command.name
    })

    await this.projectRepository.save(project)

    return project.toSnapshot()
  }
}
