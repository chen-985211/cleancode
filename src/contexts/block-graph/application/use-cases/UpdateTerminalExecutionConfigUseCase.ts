import type { TerminalExecutionConfigSnapshot } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface UpdateTerminalExecutionConfigCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

export class UpdateTerminalExecutionConfigUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalExecutionConfigCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.updateTerminalExecutionConfig(command.blockId, command.executionConfig)
    )

    return transaction.graph
  }
}
