import type { BlockGraphSnapshot, BlockPositionSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface MoveBlockCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly position: BlockPositionSnapshot
}

export class MoveBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveBlockCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.moveBlock(command.blockId, command.position)
    )

    return transaction.graph
  }
}
