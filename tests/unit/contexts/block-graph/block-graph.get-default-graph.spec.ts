import type {
  BlockGraphRepository,
  BlockGraphTransactionResult
} from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { GetDefaultGraphUseCase } from '../../../../src/contexts/block-graph/application/use-cases/GetDefaultGraphUseCase'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('get default block graph', () => {
  it('delegates initialization atomically and returns the repository-authoritative graph', async () => {
    const authoritativeGraph = BlockGraph.createDefault({
      id: 'persisted-graph',
      projectId: 'persisted-project',
      workspaceName: 'main'
    }).toSnapshot()
    const repository = new InitializingRepository(authoritativeGraph)
    const getDefaultGraph = new GetDefaultGraphUseCase(repository)

    const result = await getDefaultGraph.execute({
      projectDirectory: '/repo/app',
      projectId: 'requested-project',
      workspaceName: 'main'
    })

    expect(result).toEqual(authoritativeGraph)
    expect(repository.initialization).toEqual({
      graph: expect.objectContaining({
        projectId: 'requested-project',
        workspaceName: 'main'
      }),
      projectDirectory: '/repo/app'
    })
    expect(repository.findCount).toBe(0)
  })
})

class InitializingRepository implements BlockGraphRepository {
  findCount = 0
  initialization: {
    readonly graph: ReturnType<BlockGraph['toSnapshot']>
    readonly projectDirectory: string
  } | null = null

  constructor(private readonly authoritativeGraph: ReturnType<BlockGraph['toSnapshot']>) {}

  async initializeDefaultGraph(projectDirectory: string, graph: BlockGraph) {
    this.initialization = { graph: graph.toSnapshot(), projectDirectory }
    return this.authoritativeGraph
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
    this.findCount += 1
    return null
  }

  async findDefaultGraphSnapshot() {
    this.findCount += 1
    return null
  }

  async transactDefaultGraph<TResult>(): Promise<BlockGraphTransactionResult<TResult> | null> {
    throw new Error('Initialization must use initializeDefaultGraph.')
  }
}
