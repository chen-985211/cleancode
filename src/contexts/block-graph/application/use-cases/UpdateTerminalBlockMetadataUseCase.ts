import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface UpdateTerminalBlockMetadataCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
  readonly name: string
  readonly description: string
}

export class UpdateTerminalBlockMetadataUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: UpdateTerminalBlockMetadataCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw new Error('Default block graph was not created.')
    }

    graph.updateTerminalBlockMetadata(command.blockId, {
      name: command.name,
      description: command.description
    })

    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
