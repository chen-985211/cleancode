import type { CanvasArrangementSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface MoveCanvasStackCommand {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly projectDirectory: string
  readonly projectId: string
  readonly stackId: string
  readonly workspaceId: string
}

export class MoveCanvasStackUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: MoveCanvasStackCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      command,
      (arrangement) => arrangement.moveStack(command.stackId, command.anchor)
    )
    return transaction.snapshot
  }
}
