import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { SaveDefaultGraphUseCase } from '../../../../src/contexts/block-graph/application/use-cases/SaveDefaultGraphUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'

class InMemoryBlockGraphRepository implements BlockGraphRepository {
  savedGraph: BlockGraph | null = null

  async saveDefaultGraph(_projectDirectory: string, graph: BlockGraph): Promise<void> {
    this.savedGraph = graph
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
    return this.savedGraph
  }

  async findDefaultGraphSnapshot() {
    return this.savedGraph?.toSnapshot() ?? null
  }
}

describe('save default block graph', () => {
  it('persists the current graph snapshot through the graph repository', async () => {
    const repository = new InMemoryBlockGraphRepository()
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })
    graph.createTerminalBlock({
      name: 'Terminal',
      description: 'Local shell',
      position: { x: 320, y: 240 }
    })

    const saveDefaultGraph = new SaveDefaultGraphUseCase(repository)

    const savedGraph = await saveDefaultGraph.execute({
      projectDirectory: '/tmp/cleancode-demo',
      graph: graph.toSnapshot()
    })

    expect(savedGraph).toEqual(graph.toSnapshot())
    expect(repository.savedGraph?.toSnapshot()).toEqual(graph.toSnapshot())
  })
})
