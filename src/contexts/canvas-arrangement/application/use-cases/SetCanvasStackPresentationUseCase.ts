import type {
  CanvasArrangementSnapshot,
  CanvasStackPresentation
} from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface SetCanvasStackPresentationCommand {
  readonly presentation: CanvasStackPresentation
  readonly projectDirectory: string
  readonly projectId: string
  readonly stackId: string
  readonly workspaceId: string
}

export class SetCanvasStackPresentationUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: SetCanvasStackPresentationCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      command,
      (arrangement) => arrangement.setStackPresentation(command.stackId, command.presentation)
    )
    return transaction.snapshot
  }
}
