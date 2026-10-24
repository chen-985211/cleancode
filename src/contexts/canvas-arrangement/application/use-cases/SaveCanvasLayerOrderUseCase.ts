import type {
  CanvasArrangementSnapshot,
  CanvasLayerItemReference
} from '../dto/CanvasArrangementSnapshot'
import type { CanvasArrangementRepository } from '../ports/CanvasArrangementRepository'

export interface SaveCanvasLayerOrderCommand {
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceId: string
  readonly items: readonly CanvasLayerItemReference[]
}

export class SaveCanvasLayerOrderUseCase {
  constructor(private readonly repository: CanvasArrangementRepository) {}

  async execute(command: SaveCanvasLayerOrderCommand): Promise<CanvasArrangementSnapshot> {
    const transaction = await this.repository.transactWorkspace(
      command.projectDirectory,
      command,
      (arrangement) => arrangement.setLayerOrder(command.items)
    )
    return transaction.snapshot
  }
}
