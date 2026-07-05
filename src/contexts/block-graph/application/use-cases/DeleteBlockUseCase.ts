import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface DeleteBlockCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
}

export class DeleteBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: DeleteBlockCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw new Error('Default block graph was not created.')
    }

    graph.deleteBlock(command.blockId)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
