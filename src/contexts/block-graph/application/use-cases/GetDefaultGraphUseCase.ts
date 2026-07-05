import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface GetDefaultGraphQuery {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
}

export class GetDefaultGraphUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(query: GetDefaultGraphQuery): Promise<BlockGraphSnapshot> {
    const existingGraph = await this.graphRepository.findDefaultGraph(
      query.projectDirectory,
      query.workspaceName
    )

    if (existingGraph) {
      return existingGraph.toSnapshot()
    }

    const graph = BlockGraph.createDefault({
      projectId: query.projectId,
      workspaceName: query.workspaceName
    })

    await this.graphRepository.saveDefaultGraph(query.projectDirectory, graph)

    return graph.toSnapshot()
  }
}
