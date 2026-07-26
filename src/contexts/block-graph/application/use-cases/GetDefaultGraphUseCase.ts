import { BlockGraph } from '../../domain/aggregates/BlockGraph'
import type { BlockGraphSnapshot } from '../dto/BlockGraphSnapshot'
import type { BlockGraphRepository } from '../ports/BlockGraphRepository'

export interface GetDefaultGraphQuery {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
}

export class GetDefaultGraphUseCase {
  constructor(private readonly graphRepository: BlockGraphRepository) {}

  async execute(query: GetDefaultGraphQuery): Promise<BlockGraphSnapshot> {
    const graph = BlockGraph.createDefault({
      projectId: query.projectId,
      workspaceId: query.workspaceId
    })

    return this.graphRepository.initializeDefaultGraph(query.projectDirectory, graph)
  }
}
