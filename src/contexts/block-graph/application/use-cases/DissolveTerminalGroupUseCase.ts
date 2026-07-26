import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface DissolveTerminalGroupCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly terminalGroupId: string
}

export class DissolveTerminalGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DissolveTerminalGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.dissolveTerminalGroup(command.terminalGroupId)
    )

    return transaction.graph
  }
}
