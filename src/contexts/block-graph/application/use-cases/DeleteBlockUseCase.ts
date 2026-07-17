import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface DeleteBlockCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
}

export class DeleteBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DeleteBlockCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.deleteBlock(command.blockId)
    )

    return transaction.graph
  }
}
