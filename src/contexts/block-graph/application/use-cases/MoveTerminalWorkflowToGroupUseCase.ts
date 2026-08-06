import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface MoveTerminalWorkflowToGroupCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly targetTerminalGroupId: string | null
  readonly position: { readonly x: number; readonly y: number }
}

export class MoveTerminalWorkflowToGroupUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveTerminalWorkflowToGroupCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) =>
        graph.moveTerminalWorkflowToGroup(
          command.blockId,
          command.targetTerminalGroupId,
          command.position
        )
    )

    return transaction.graph
  }
}
