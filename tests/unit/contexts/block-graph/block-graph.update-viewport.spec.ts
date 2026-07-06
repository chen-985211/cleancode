import {
  BlockGraph,
  defaultCanvasViewport,
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { UpdateGraphViewportUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateGraphViewportUseCase'
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

describe('update graph viewport', () => {
  it('persists the canvas viewport without changing existing blocks', async () => {
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
    const updateGraphViewport = new UpdateGraphViewportUseCase(repository)

    const updatedGraph = await updateGraphViewport.execute({
      projectDirectory: '/tmp/project',
      workspaceName: 'main',
      viewport: { x: -312.5, y: 144.25, zoom: 1.25 }
    })

    expect(updatedGraph.viewport).toEqual({ x: -312.5, y: 144.25, zoom: 1.25 })
    expect(updatedGraph.blocks[0]).toMatchObject({
      id: terminalBlock.id,
      position: { x: 320, y: 240 }
    })
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })

  it('restores legacy graph snapshots with the default canvas viewport', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: []
    })

    expect(graph.toSnapshot().viewport).toEqual(defaultCanvasViewport)
  })

  it('keeps persisted zoom inside the supported canvas range', () => {
    const graph = BlockGraph.createDefault({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    graph.updateViewport({ x: 80, y: -90, zoom: 99 })
    expect(graph.toSnapshot().viewport).toEqual({
      x: 80,
      y: -90,
      zoom: maximumCanvasZoom
    })

    graph.updateViewport({ x: Number.NaN, y: Number.POSITIVE_INFINITY, zoom: -10 })
    expect(graph.toSnapshot().viewport).toEqual({
      x: 80,
      y: -90,
      zoom: minimumCanvasZoom
    })
  })
})
