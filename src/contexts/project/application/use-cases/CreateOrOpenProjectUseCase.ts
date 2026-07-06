import { Project } from '../../domain/aggregates/Project'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface CreateOrOpenProjectCommand {
  readonly directory: string
  readonly name: string
}

export class CreateOrOpenProjectUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort
  ) {}

  async execute(command: CreateOrOpenProjectCommand): Promise<ProjectSnapshot> {
    const existingProject = await this.projectRepository.findByDirectory(command.directory)
    const project = existingProject
      ? Project.fromSnapshot(existingProject)
      : Project.create({
          directory: command.directory,
          name: command.name
        })
    const synchronizedProject = await this.synchronizeGitBinding(project)

    await this.projectRepository.save(synchronizedProject)

    return synchronizedProject.toSnapshot()
  }

  private async synchronizeGitBinding(project: Project): Promise<Project> {
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

    if (!inspection.isGitRepository) {
      return project.syncGitBranchWorkspaces({
        mainDirectory: project.directory,
        mainGitBranch: null,
        worktrees: []
      })
    }

    const mainGitBranch =
      inspection.branches.find((branch) => branch.isCurrent)?.name ?? inspection.currentBranch
    const worktrees = inspection.branches
      .filter((branch) => branch.worktreeDirectory && !branch.isCurrent)
      .map((branch) => ({
        branchName: branch.name,
        directory: branch.worktreeDirectory ?? project.directory
      }))

    return project.syncGitBranchWorkspaces({
      mainDirectory: project.directory,
      mainGitBranch,
      worktrees
    })
  }
}
