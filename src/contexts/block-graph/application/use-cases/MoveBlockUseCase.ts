import type { BlockGraphSnapshot, BlockPositionSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface MoveBlockCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly blockId: string
  readonly position: BlockPositionSnapshot
}

export class MoveBlockUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: MoveBlockCommand): Promise<BlockGraphSnapshot> {
    const graph = await this.graphRepository.findDefaultGraph(
      command.projectDirectory,
      command.workspaceName
    )

    if (!graph) {
      throw new Error('Default block graph was not created.')
    }

    graph.moveBlock(command.blockId, command.position)
    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
