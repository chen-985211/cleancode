import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface SaveDefaultGraphCommand {
  readonly projectDirectory: string
  readonly graph: BlockGraphSnapshot
}

export class SaveDefaultGraphUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(command: SaveDefaultGraphCommand): Promise<BlockGraphSnapshot> {
    const graph = BlockGraph.fromSnapshot(command.graph)

    await this.graphRepository.saveDefaultGraph(command.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
