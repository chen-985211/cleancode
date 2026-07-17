import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface AddTerminalToGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly blockId: string
}

export class AddTerminalToGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: AddTerminalToGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.addTerminalToGroup(command.terminalGroupId, command.blockId)
    )

    return transaction.graph
  }
}
