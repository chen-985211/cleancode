import { Project } from '../../domain/aggregates/Project'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface ArchiveBranchWorkspaceCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export class ArchiveBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort
  ) {}

  async execute(command: ArchiveBranchWorkspaceCommand): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw new Error('Project was not found.')
    }

    const project = Project.fromSnapshot(projectSnapshot)
    const workspaceName = command.workspaceName.trim()
    const workspace = project.workspaces.find((entry) => entry.name === workspaceName)

    if (!workspace) {
      throw new Error('Branch workspace was not found.')
    }

    const archivedProject = project.archiveBranchWorkspace(workspaceName)
    const isClean = await this.gitWorkspacePort.isWorkingTreeClean(workspace.directory)

    if (!isClean) {
      throw new Error('Branch workspace has uncommitted changes.')
    }

    await this.gitWorkspacePort.removeBranchWorktree({
      repositoryDirectory: project.directory,
      worktreeDirectory: workspace.directory
    })
    await this.gitWorkspacePort.pruneWorktrees({
      repositoryDirectory: project.directory
    })
    await this.projectRepository.save(archivedProject)

    return archivedProject.toSnapshot()
  }
}
