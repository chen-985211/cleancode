import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface UpdateTerminalGroupMetadataCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly terminalGroupId: string
  readonly name: string
}

export class UpdateTerminalGroupMetadataUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalGroupMetadataCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) => graph.updateTerminalGroupMetadata(command.terminalGroupId, { name: command.name })
    )

    return transaction.graph
  }
}
