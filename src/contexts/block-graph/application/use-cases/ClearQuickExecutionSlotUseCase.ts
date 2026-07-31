import type { BlockGraphSnapshot, QuickExecutionSlotNumber } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface ClearQuickExecutionSlotCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly number: QuickExecutionSlotNumber
}

export class ClearQuickExecutionSlotUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ClearQuickExecutionSlotCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.clearQuickExecutionSlot(command.number)
    )

    return transaction.graph
  }
}
