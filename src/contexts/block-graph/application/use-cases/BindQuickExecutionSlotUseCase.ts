import type {
  BlockGraphSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot
} from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface BindQuickExecutionSlotCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly number: QuickExecutionSlotNumber
  readonly target: QuickExecutionTargetSnapshot
}

export class BindQuickExecutionSlotUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: BindQuickExecutionSlotCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.bindQuickExecutionSlot(command.number, command.target)
    )

    return transaction.graph
  }
}
