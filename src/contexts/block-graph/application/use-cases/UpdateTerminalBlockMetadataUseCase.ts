import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'
import { executeDefaultGraphTransaction } from './executeDefaultGraphTransaction'

export interface UpdateTerminalBlockMetadataCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly name: string
  readonly description: string
  readonly launchCommand: string
}

export class UpdateTerminalBlockMetadataUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalBlockMetadataCommand): Promise<BlockGraphSnapshot> {
    const transaction = await executeDefaultGraphTransaction(
      this.graphRepository,
      command,
      (graph) =>
        graph.updateTerminalBlockMetadata(command.blockId, {
          name: command.name,
          description: command.description,
          launchCommand: command.launchCommand
        })
    )

    return transaction.graph
  }
}
