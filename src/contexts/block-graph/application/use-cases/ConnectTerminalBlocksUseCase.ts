import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface ConnectTerminalBlocksCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly sourceBlockId: string
  readonly targetBlockId: string
}

export class ConnectTerminalBlocksUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ConnectTerminalBlocksCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) =>
        graph.connectTerminalBlocks({
          sourceBlockId: command.sourceBlockId,
          targetBlockId: command.targetBlockId
        })
    )

    return transaction.graph
  }
}
