import { CreateTerminalBlockUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalBlockUseCase'
import type {
  BlockGraphRepository,
  BlockGraphTransactionResult
} from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('create terminal block layout', () => {
  it('commits an explicit position, size, and launch command in one transaction', async () => {
    const repository = new TransactionalBlockGraphRepository(createGraph())
    const createTerminalBlock = new CreateTerminalBlockUseCase(repository)

    const graph = await createTerminalBlock.execute({
      canvasRegions: [region(300, 100, 720, 460), region(0, 0, 2000, 2000)],
      description: 'Runs the dev server.',
      launchCommand: ' pnpm dev ',
      name: 'Development',
      position: { x: 33, y: 44 },
      projectDirectory: '/tmp/project',
      size: { width: 420, height: 260 },
      workspaceId: 'main'
    })

    expect(graph.blocks.at(-1)).toMatchObject({
      description: 'Runs the dev server.',
      launchCommand: 'pnpm dev',
      name: 'Development',
      position: { x: 33, y: 44 },
      size: { width: 420, height: 260 }
    })
    expect(repository.transactionCount).toBe(1)
  })

  it('automatically places an omitted position near occupied canvas regions using the new size', async () => {
    const repository = new TransactionalBlockGraphRepository(createGraph())
    const createTerminalBlock = new CreateTerminalBlockUseCase(repository)

    const graph = await createTerminalBlock.execute({
      canvasRegions: [region(300, 100, 720, 460), region(300, 624, 720, 180)],
      description: '',
      name: 'Automatic',
      projectDirectory: '/tmp/project',
      size: { width: 420, height: 240 },
      workspaceId: 'main'
    })

    expect(graph.blocks.at(-1)).toMatchObject({
      name: 'Automatic',
      position: { x: 784, y: 868 },
      size: { width: 420, height: 240 }
    })
    expect(repository.transactionCount).toBe(1)
  })

  it('rejects automatic placement without an anchor and leaves the graph unchanged', async () => {
    const repository = new TransactionalBlockGraphRepository(createGraph())
    const before = repository.graph?.toSnapshot()
    const createTerminalBlock = new CreateTerminalBlockUseCase(repository)

    await expect(
      createTerminalBlock.execute({
        description: '',
        name: 'Automatic',
        projectDirectory: '/tmp/project',
        workspaceId: 'main'
      })
    ).rejects.toThrow('Automatic terminal placement requires canvas regions.')
    expect(repository.graph?.toSnapshot()).toEqual(before)
  })
})

class TransactionalBlockGraphRepository implements BlockGraphRepository {
  graph: BlockGraph | null
  transactionCount = 0

  constructor(graph: BlockGraph | null) {
    this.graph = graph
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ): Promise<BlockGraphTransactionResult<TResult> | null> {
    this.transactionCount += 1
    if (!this.graph) return null

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

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  graph.createTerminalBlock({
    id: 'existing-terminal',
    name: 'Existing',
    description: '',
    position: { x: 300, y: 900 },
    size: { width: 420, height: 240 }
  })

  return graph
}

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { width, height } }
}
