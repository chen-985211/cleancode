import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import type {
  TerminalRunLifecycleLease,
  TerminalRunLifecyclePort
} from '../../../../src/contexts/block-graph/application/ports/TerminalRunLifecyclePort'
import { DeleteBlockUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DeleteBlockUseCase'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('delete terminal Run lifecycle', () => {
  it('hard-disposes the exact terminal and resolves its start gate after graph commit', async () => {
    const fixture = createFixture()

    await fixture.deleteBlock.execute({
      blockId: 'server',
      projectDirectory: '/project',
      workspaceId: 'main'
    })

    expect(fixture.calls).toEqual([
      'run:acquire:project-1:/project:main:server',
      'run:hard-dispose',
      'graph:save',
      'run:resolve'
    ])
  })

  it('releases the start gate when graph persistence fails after a confirmed disposal', async () => {
    const fixture = createFixture()
    fixture.repository.saveError = new Error('save failed')

    await expect(
      fixture.deleteBlock.execute({
        blockId: 'server',
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).rejects.toThrow('save failed')

    expect(fixture.calls).toEqual([
      'run:acquire:project-1:/project:main:server',
      'run:hard-dispose',
      'graph:save',
      'run:release'
    ])
  })

  it('does not dispose a Run when the terminal does not exist', async () => {
    const fixture = createFixture()

    await expect(
      fixture.deleteBlock.execute({
        blockId: 'missing',
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).rejects.toMatchObject({ code: 'TERMINAL_BLOCK_NOT_FOUND' })

    expect(fixture.calls).toEqual([])
  })

  it('quarantines the start gate when hard disposal cannot confirm cleanup', async () => {
    const fixture = createFixture({ hardDisposeError: new Error('cleanup uncertain') })

    await expect(
      fixture.deleteBlock.execute({
        blockId: 'server',
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).rejects.toThrow('cleanup uncertain')

    expect(fixture.calls).toEqual([
      'run:acquire:project-1:/project:main:server',
      'run:hard-dispose',
      'run:quarantine'
    ])
  })
})

function createFixture(input: { readonly hardDisposeError?: Error } = {}) {
  const calls: string[] = []
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  graph.createTerminalBlock({
    id: 'server',
    description: '',
    name: 'Server',
    position: { x: 0, y: 0 }
  })
  const repository = new LifecycleRepository(graph, calls)
  const lifecycle: TerminalRunLifecyclePort = {
    acquireTerminalDeletion: async (scope) => {
      calls.push(
        `run:acquire:${scope.projectId}:${scope.projectDirectory}:${scope.workspaceId}:${scope.blockId}`
      )
      return createLease(calls, input.hardDisposeError)
    }
  }

  return {
    calls,
    deleteBlock: new DeleteBlockUseCase(repository, lifecycle),
    repository
  }
}

function createLease(calls: string[], hardDisposeError?: Error): TerminalRunLifecycleLease {
  return {
    hardDispose: async () => {
      calls.push('run:hard-dispose')
      if (hardDisposeError) throw hardDisposeError
    },
    quarantine: () => calls.push('run:quarantine'),
    release: () => calls.push('run:release'),
    resolve: () => calls.push('run:resolve')
  }
}

class LifecycleRepository implements BlockGraphRepository {
  saveError: Error | null = null

  constructor(
    private graph: BlockGraph,
    private readonly calls: string[]
  ) {}

  async initializeDefaultGraph() {
    return this.graph.toSnapshot()
  }

  async findDefaultGraph() {
    return this.graph
  }

  async findDefaultGraphSnapshot() {
    return this.graph.toSnapshot()
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    const candidate = BlockGraph.fromSnapshot(this.graph.toSnapshot())
    const result = await transaction(candidate)
    this.calls.push('graph:save')
    if (this.saveError) throw this.saveError
    this.graph = candidate
    return { graph: this.graph.toSnapshot(), result }
  }
}
