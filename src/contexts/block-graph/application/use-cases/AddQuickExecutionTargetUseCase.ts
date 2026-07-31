import type { BlockGraphSnapshot, QuickExecutionTargetSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface AddQuickExecutionTargetCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly target: QuickExecutionTargetSnapshot
}

export class AddQuickExecutionTargetUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: AddQuickExecutionTargetCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.addQuickExecutionTarget(command.target)
    )

    return transaction.graph
  }
}
