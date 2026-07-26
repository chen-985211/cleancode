import {
  BlockGraph,
  defaultTerminalBlockSize,
  minimumTerminalBlockSize
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { ResizeTerminalBlockUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ResizeTerminalBlockUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'

class InMemoryBlockGraphRepository implements BlockGraphRepository {
  savedGraph: BlockGraph | null = null

  constructor(initialGraph: BlockGraph) {
    this.savedGraph = initialGraph
  }

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    this.savedGraph = graph
    return graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
    return this.savedGraph
  }

  async findDefaultGraphSnapshot() {
    return this.savedGraph?.toSnapshot() ?? null
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    if (!this.savedGraph) return null
    const result = await transaction(this.savedGraph)
    return { graph: this.savedGraph.toSnapshot(), result }
  }
}

describe('resize terminal block', () => {
  it('persists the terminal final rectangle through the resize use case', async () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const terminalBlock = graph.createTerminalBlock({
      name: 'Terminal 1',
      description: '本地终端',
      position: { x: 320, y: 240 }
    })
    const repository = new InMemoryBlockGraphRepository(graph)
    const resizeTerminalBlock = new ResizeTerminalBlockUseCase(repository)

    const updatedGraph = await resizeTerminalBlock.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      blockId: terminalBlock.id,
      position: { x: 180, y: 140 },
      size: { width: 760, height: 420 }
    })

    expect(updatedGraph.blocks[0]).toMatchObject({
      id: terminalBlock.id,
      position: { x: 180, y: 140 },
      size: { width: 760, height: 420 }
    })
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })

  it('keeps resized terminal blocks large enough to remain readable', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const terminalBlock = graph.createTerminalBlock({
      name: 'Terminal 1',
      description: '本地终端',
      position: { x: 320, y: 240 }
    })

    graph.resizeTerminalBlock(terminalBlock.id, {
      position: { x: 180, y: 140 },
      size: { width: 120, height: 90 }
    })

    expect(graph.toSnapshot().blocks[0]).toMatchObject({
      position: { x: 180, y: 140 },
      size: minimumTerminalBlockSize
    })
  })

  it('restores legacy terminal blocks with the default readable size', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal',
          name: 'Legacy Terminal',
          description: '本地终端',
          position: { x: 300, y: 220 }
        } as never
      ]
    })

    expect(graph.toSnapshot().blocks[0]).toMatchObject({
      id: 'terminal-1',
      size: defaultTerminalBlockSize
    })
  })
})
