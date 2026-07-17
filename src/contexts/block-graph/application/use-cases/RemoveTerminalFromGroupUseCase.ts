import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface RemoveTerminalFromGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly blockId: string
}

export class RemoveTerminalFromGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: RemoveTerminalFromGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.removeTerminalFromGroup(command.terminalGroupId, command.blockId)
    )

    return transaction.graph
  }
}
