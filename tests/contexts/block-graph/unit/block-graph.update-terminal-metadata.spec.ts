import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { UpdateTerminalBlockMetadataUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalBlockMetadataUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'

class InMemoryBlockGraphRepository implements BlockGraphRepository {
  savedGraph: BlockGraph | null = null

  constructor(initialGraph: BlockGraph) {
    this.savedGraph = initialGraph
  }

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

describe('update terminal block metadata', () => {
  it('renames a terminal block and persists the description', async () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })
    const terminalBlock = graph.createTerminalBlock({
      name: 'Terminal 1',
      description: '本地终端',
      position: { x: 320, y: 240 }
    })
    const repository = new InMemoryBlockGraphRepository(graph)
    const updateMetadata = new UpdateTerminalBlockMetadataUseCase(repository)

    const updatedGraph = await updateMetadata.execute({
      projectDirectory: '/tmp/project',
      workspaceName: 'main',
      blockId: terminalBlock.id,
      name: 'API Server',
      description: 'Runs backend tasks'
    })

    expect(updatedGraph.blocks[0]).toMatchObject({
      id: terminalBlock.id,
      name: 'API Server',
      description: 'Runs backend tasks'
    })
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })
})
