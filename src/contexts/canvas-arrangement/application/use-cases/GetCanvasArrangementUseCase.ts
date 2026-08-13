import type { CanvasArrangementSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export class GetCanvasArrangementUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: {
    readonly projectDirectory: string
    readonly projectId: string
    readonly workspaceId: string
  }): Promise<CanvasArrangementSnapshot> {
    return (
      (await this.repository.findWorkspaceSnapshot(
        command.projectDirectory,
        command.workspaceId
      )) ?? {
        projectId: command.projectId,
        workspaceId: command.workspaceId,
        stacks: []
      }
    )
  }
}
