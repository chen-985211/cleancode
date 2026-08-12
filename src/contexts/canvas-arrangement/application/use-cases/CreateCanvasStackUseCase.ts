import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot
} from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface CreateCanvasStackCommand {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly items: readonly CanvasArrangementItemReference[]
  readonly projectDirectory: string
  readonly projectId: string
  readonly stackId: string
  readonly workspaceId: string
}

export class CreateCanvasStackUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: CreateCanvasStackCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      command,
      (arrangement) =>
        arrangement.createMergedStack({
          anchor: command.anchor,
          id: command.stackId,
          items: command.items
        })
    )
    return transaction.snapshot
  }
}
