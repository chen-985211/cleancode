import type { CanvasArrangementSnapshot } from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface ReconcileCanvasArrangementCommand {
  readonly projectDirectory: string
  readonly projectId: string
  readonly validItemKeys: readonly string[]
  readonly workspaceId: string
}

export class ReconcileCanvasArrangementUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: ReconcileCanvasArrangementCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      { projectId: command.projectId, workspaceId: command.workspaceId },
      (arrangement) => arrangement.reconcile(command.validItemKeys)
    )

    return transaction.snapshot
  }
}
