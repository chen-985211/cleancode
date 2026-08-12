import type { CanvasArrangementSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface RemoveCanvasStackCommand {
  readonly projectDirectory: string
  readonly projectId: string
  readonly stackId: string
  readonly workspaceId: string
}

export class RemoveCanvasStackUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: RemoveCanvasStackCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      command,
      (arrangement) => arrangement.removeStack(command.stackId)
    )
    return transaction.snapshot
  }
}
