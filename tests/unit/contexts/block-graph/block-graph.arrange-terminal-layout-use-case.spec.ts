import { ArrangeTerminalLayoutUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ArrangeTerminalLayoutUseCase'
import type {
  BlockGraphRepository,
  BlockGraphTransactionResult
} from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('arrange terminal layout use case', () => {
  it('arranges the exact scope and persists it in one default graph transaction', async () => {
    const repository = new TransactionalBlockGraphRepository(createWorkflowGraph())
    const arrangeTerminalLayout = new ArrangeTerminalLayoutUseCase(repository)

    const result = await arrangeTerminalLayout.execute({
      blockIds: ['downstream-terminal', 'upstream-terminal', 'group-companion'],
      canvasRegions: [region(500, 100, 600, 400)],
      projectDirectory: '/tmp/project',
      workspaceId: 'main'
    })

    expect(result).toEqual({
      arrangedBlockIds: ['group-companion', 'upstream-terminal', 'downstream-terminal'],
      arrangedTerminalGroupIds: ['workflow-group'],
      graph: repository.graph?.toSnapshot(),
      graphChanged: true
    })
    expect(result.graph.blocks.map((block) => [block.id, block.position])).toEqual([
      ['upstream-terminal', { x: 138, y: 640 }],
      ['downstream-terminal', { x: 622, y: 640 }],
      ['unrelated-terminal', { x: 80, y: 80 }],
      ['group-companion', { x: 380, y: 944 }]
    ])
    expect(repository.transactionCount).toBe(1)
  })

  it('reports an idempotent layout without adding a second persistence path', async () => {
    const repository = new TransactionalBlockGraphRepository(createWorkflowGraph())
    const arrangeTerminalLayout = new ArrangeTerminalLayoutUseCase(repository)
    const command = {
      blockIds: ['upstream-terminal', 'downstream-terminal', 'group-companion'],
      canvasRegions: [region(500, 100, 600, 400)],
      projectDirectory: '/tmp/project',
      workspaceId: 'main'
    }

    await arrangeTerminalLayout.execute(command)
    const result = await arrangeTerminalLayout.execute(command)

    expect(result.graphChanged).toBe(false)
    expect(repository.transactionCount).toBe(2)
  })

  it('preserves a concurrently moved terminal while arranging the unchanged targets', async () => {
    const graph = createWorkflowGraph()
    graph.dissolveTerminalGroup('workflow-group')
    const repository = new TransactionalBlockGraphRepository(graph, (currentGraph) => {
      currentGraph.moveBlock('upstream-terminal', { x: 1600, y: 900 })
    })
    const arrangeTerminalLayout = new ArrangeTerminalLayoutUseCase(repository)

    const result = await arrangeTerminalLayout.execute({
      blockIds: ['upstream-terminal', 'downstream-terminal'],
      canvasRegions: [region(500, 100, 600, 400)],
      projectDirectory: '/tmp/project',
      workspaceId: 'main'
    })

    expect(result.arrangedBlockIds).toEqual(['downstream-terminal'])
    expect(result.graph.blocks.map((block) => [block.id, block.position])).toEqual([
      ['upstream-terminal', { x: 1600, y: 900 }],
      ['downstream-terminal', { x: 820, y: 564 }],
      ['unrelated-terminal', { x: 80, y: 80 }],
      ['group-companion', { x: 40, y: 40 }]
    ])
  })

  it('preserves a complete group when one member moves before layout commits', async () => {
    const repository = new TransactionalBlockGraphRepository(
      createWorkflowGraph(),
      (currentGraph) => {
        currentGraph.moveBlock('upstream-terminal', { x: 1600, y: 900 })
      }
    )
    const arrangeTerminalLayout = new ArrangeTerminalLayoutUseCase(repository)

    const result = await arrangeTerminalLayout.execute({
      blockIds: ['upstream-terminal', 'downstream-terminal', 'group-companion'],
      canvasRegions: [region(500, 100, 600, 400)],
      projectDirectory: '/tmp/project',
      workspaceId: 'main'
    })

    expect(result).toMatchObject({
      arrangedBlockIds: [],
      arrangedTerminalGroupIds: [],
      graphChanged: false
    })
    expect(result.graph.blocks.map((block) => [block.id, block.position])).toEqual([
      ['upstream-terminal', { x: 1600, y: 900 }],
      ['downstream-terminal', { x: 800, y: 40 }],
      ['unrelated-terminal', { x: 80, y: 80 }],
      ['group-companion', { x: 40, y: 40 }]
    ])
  })

  it('fails when the default graph is missing', async () => {
    const repository = new TransactionalBlockGraphRepository(null)
    const arrangeTerminalLayout = new ArrangeTerminalLayoutUseCase(repository)

    await expect(
      arrangeTerminalLayout.execute({
        blockIds: ['missing-terminal'],
        canvasRegions: [region(500, 100, 600, 400)],
        projectDirectory: '/tmp/project',
        workspaceId: 'main'
      })
    ).rejects.toThrow('Default block graph was not created.')
  })
})

class TransactionalBlockGraphRepository implements BlockGraphRepository {
  graph: BlockGraph | null
  transactionCount = 0

  constructor(
    graph: BlockGraph | null,
    private beforeTransaction?: (graph: BlockGraph) => void
  ) {
    this.graph = graph
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ): Promise<BlockGraphTransactionResult<TResult> | null> {
    this.transactionCount += 1
    if (!this.graph) return null

    this.beforeTransaction?.(this.graph)
    this.beforeTransaction = undefined

    const candidate = BlockGraph.fromSnapshot(this.graph.toSnapshot())
    const result = await transaction(candidate)
    this.graph = candidate

    return { graph: candidate.toSnapshot(), result }
  }

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    return graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
    throw new Error('Use cases must use transactDefaultGraph.')
  }

  async findDefaultGraphSnapshot() {
    return this.graph?.toSnapshot() ?? null
  }
}

function createWorkflowGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  graph.createTerminalBlock({
    id: 'upstream-terminal',
    name: 'Upstream',
    description: '',
    position: { x: 40, y: 40 },
    size: { width: 420, height: 240 }
  })
  graph.createTerminalBlock({
    id: 'downstream-terminal',
    name: 'Downstream',
    description: '',
    position: { x: 800, y: 40 },
    size: { width: 420, height: 240 }
  })
  graph.createTerminalBlock({
    id: 'unrelated-terminal',
    name: 'Unrelated',
    description: '',
    position: { x: 80, y: 80 },
    size: { width: 420, height: 240 }
  })
  graph.createTerminalBlock({
    id: 'group-companion',
    name: 'Group companion',
    description: '',
    position: { x: 40, y: 40 },
    size: { width: 420, height: 240 }
  })
  graph.connectTerminalBlocks({
    sourceBlockId: 'upstream-terminal',
    targetBlockId: 'downstream-terminal'
  })
  graph.createTerminalGroup({
    id: 'workflow-group',
    name: 'Workflow',
    memberBlockIds: ['upstream-terminal', 'downstream-terminal', 'group-companion']
  })

  return graph
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { width, height } }
}
