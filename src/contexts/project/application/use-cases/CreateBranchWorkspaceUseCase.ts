import { Project } from '../../domain/aggregates/Project'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { BranchWorkspaceDirectoryPort } from '../ports/BranchWorkspaceDirectoryPort'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface CreateBranchWorkspaceCommand {
  readonly projectDirectory: string
  readonly branchName: string
}

export class CreateBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly branchWorkspaceDirectoryPort: BranchWorkspaceDirectoryPort
  ) {}

  async execute(command: CreateBranchWorkspaceCommand): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw new Error('Project was not found.')
    }

    const branchName = command.branchName.trim()
    const project = Project.fromSnapshot(projectSnapshot)
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

    if (!inspection.isGitRepository) {
      throw new Error('Project is not a Git repository.')
    }

    if (!inspection.currentBranch) {
      throw new Error('Git repository has no current branch.')
    }

    if (inspection.localBranches.includes(branchName)) {
      throw new Error('Git branch already exists.')
    }

    const worktreeDirectory = this.branchWorkspaceDirectoryPort.resolveBranchWorkspaceDirectory({
      projectDirectory: project.directory,
      branchName
    })
    const updatedProject = project.addBranchWorkspace({
      name: branchName,
      directory: worktreeDirectory,
      gitBranch: branchName
    })

    await this.gitWorkspacePort.createBranchWorktree({
      repositoryDirectory: project.directory,
      branchName,
      worktreeDirectory
    })
    await this.projectRepository.save(updatedProject)

    return updatedProject.toSnapshot()
  }
}
