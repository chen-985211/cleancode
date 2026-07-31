import type { BlockGraphSnapshot, QuickExecutionSlotNumber } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface ReorderQuickExecutionSlotsCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly sourceNumber: QuickExecutionSlotNumber
  readonly destinationNumber: QuickExecutionSlotNumber
}

export class ReorderQuickExecutionSlotsUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: ReorderQuickExecutionSlotsCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.reorderQuickExecutionSlots(command.sourceNumber, command.destinationNumber)
    )

    return transaction.graph
  }
}
