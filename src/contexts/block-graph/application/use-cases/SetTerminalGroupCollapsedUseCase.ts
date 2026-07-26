import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface SetTerminalGroupCollapsedCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly terminalGroupId: string
  readonly isCollapsed: boolean
}

export class SetTerminalGroupCollapsedUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: SetTerminalGroupCollapsedCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.setTerminalGroupCollapsed(command.terminalGroupId, command.isCollapsed)
    )

    return transaction.graph
  }
}
