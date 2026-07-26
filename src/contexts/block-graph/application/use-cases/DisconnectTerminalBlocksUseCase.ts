import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface DisconnectTerminalBlocksCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly connectionId: string
}

export class DisconnectTerminalBlocksUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DisconnectTerminalBlocksCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.disconnectTerminalBlocks(command.connectionId)
    )

    return transaction.graph
  }
}
