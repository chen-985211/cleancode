import type { BlockGraphSnapshot, BlockPositionSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface MoveTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly terminalGroupId: string
  readonly position: BlockPositionSnapshot
}

export class MoveTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.moveTerminalGroup(command.terminalGroupId, command.position)
    )

    return transaction.graph
  }
}
