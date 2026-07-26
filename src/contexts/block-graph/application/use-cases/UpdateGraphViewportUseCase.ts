import type { BlockGraphSnapshot, CanvasViewportSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface UpdateGraphViewportCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly viewport: CanvasViewportSnapshot
}

export class UpdateGraphViewportUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateGraphViewportCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.updateViewport(command.viewport)
    )

    return transaction.graph
  }
}
