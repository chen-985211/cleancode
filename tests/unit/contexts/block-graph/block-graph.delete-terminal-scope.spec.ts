import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import type {
  TerminalRunLifecycleLease,
  TerminalRunLifecyclePort
} from '../../../../src/contexts/block-graph/application/ports/TerminalRunLifecyclePort'
import { DeleteTerminalScopeUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DeleteTerminalScopeUseCase'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('delete terminal scope', () => {
  it('deletes one complete workflow in one graph transaction and preserves unrelated objects', async () => {
    const fixture = createFixture()

    const snapshot = await fixture.deleteTerminalScope.execute({
      projectDirectory: '/project',
      target: {
        type: 'workflow',
        terminalBlockIds: ['workflow-a', 'workflow-b']
      },
      workspaceId: 'main'
    })

    expect(fixture.calls).toEqual([
      'run:acquire:workflow-a,workflow-b',
      'run:hard-dispose',
      'graph:save',
      'run:resolve'
    ])
    expect(snapshot.blocks.map((block) => block.id)).toEqual([
      'standalone',
      'combination-a',
      'combination-b'
    ])
    expect(snapshot.connections).toEqual([])
    expect(snapshot.terminalGroups).toEqual([
      expect.objectContaining({
        id: 'combination',
        memberBlockIds: ['combination-a', 'combination-b']
      })
    ])
    expect(snapshot.quickExecutionSlots?.[0]?.target).toEqual({
      type: 'workflow',
      terminalBlockIds: ['workflow-a', 'workflow-b']
    })
  })

  it('deletes a combination and every exact member without touching another workflow', async () => {
    const fixture = createFixture()

    const snapshot = await fixture.deleteTerminalScope.execute({
      projectDirectory: '/project',
      target: {
        type: 'combination',
        terminalGroupId: 'combination',
        terminalBlockIds: ['combination-a', 'combination-b']
      },
      workspaceId: 'main'
    })

    expect(fixture.calls).toEqual([
      'run:acquire:combination-a,combination-b',
      'run:hard-dispose',
      'graph:save',
      'run:resolve'
    ])
    expect(snapshot.blocks.map((block) => block.id)).toEqual([
      'workflow-a',
      'workflow-b',
      'standalone'
    ])
    expect(snapshot.connections).toEqual([
      expect.objectContaining({
        sourceBlockId: 'workflow-a',
        targetBlockId: 'workflow-b'
      })
    ])
    expect(snapshot.terminalGroups).toEqual([])
    expect(snapshot.quickExecutionSlots?.[1]?.target).toEqual({
      type: 'combination',
      terminalGroupId: 'combination'
    })
  })

  it.each([
    {
      target: { type: 'workflow' as const, terminalBlockIds: ['workflow-a'] }
    },
    {
      target: {
        type: 'combination' as const,
        terminalGroupId: 'combination',
        terminalBlockIds: ['combination-a']
      }
    }
  ])('rejects a stale $target.type scope before acquiring its Run lease', async ({ target }) => {
    const fixture = createFixture()

    await expect(
      fixture.deleteTerminalScope.execute({
        projectDirectory: '/project',
        target,
        workspaceId: 'main'
      })
    ).rejects.toMatchObject({ code: 'TERMINAL_REMOVAL_SCOPE_STALE' })

    expect(fixture.calls).toEqual([])
    expect(fixture.repository.snapshot().blocks).toHaveLength(5)
  })

  it('releases the whole target lease when graph persistence fails after confirmed cleanup', async () => {
    const fixture = createFixture()
    fixture.repository.saveError = new Error('save failed')

    await expect(
      fixture.deleteTerminalScope.execute({
        projectDirectory: '/project',
        target: {
          type: 'workflow',
          terminalBlockIds: ['workflow-a', 'workflow-b']
        },
        workspaceId: 'main'
      })
    ).rejects.toThrow('save failed')

    expect(fixture.calls).toEqual([
      'run:acquire:workflow-a,workflow-b',
      'run:hard-dispose',
      'graph:save',
      'run:release'
    ])
    expect(fixture.repository.snapshot().blocks).toHaveLength(5)
  })

  it('quarantines the whole target lease when cleanup cannot be confirmed', async () => {
    const fixture = createFixture({ hardDisposeError: new Error('cleanup uncertain') })

    await expect(
      fixture.deleteTerminalScope.execute({
        projectDirectory: '/project',
        target: {
          type: 'workflow',
          terminalBlockIds: ['workflow-a', 'workflow-b']
        },
        workspaceId: 'main'
      })
    ).rejects.toThrow('cleanup uncertain')

    expect(fixture.calls).toEqual([
      'run:acquire:workflow-a,workflow-b',
      'run:hard-dispose',
      'run:quarantine'
    ])
    expect(fixture.repository.snapshot().blocks).toHaveLength(5)
  })
})

function createFixture(input: { readonly hardDisposeError?: Error } = {}) {
  const calls: string[] = []
  const repository = new LifecycleRepository(createGraph(), calls)
  const lifecycle: TerminalRunLifecyclePort = {
    acquireTerminalDeletion: async (scope) => {
      calls.push(`run:acquire:${scope.blockIds.join(',')}`)
      return createLease(calls, input.hardDisposeError)
    }
  }

  return {
    calls,
    deleteTerminalScope: new DeleteTerminalScopeUseCase(repository, lifecycle),
    repository
  }
}

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  for (const id of ['workflow-a', 'workflow-b', 'standalone', 'combination-a', 'combination-b']) {
    graph.createTerminalBlock({
      description: '',
      id,
      name: id,
      position: { x: 0, y: 0 }
    })
  }
  graph.connectTerminalBlocks({
    id: 'workflow-a-b',
    sourceBlockId: 'workflow-a',
    targetBlockId: 'workflow-b'
  })
  graph.createTerminalGroup({
    id: 'combination',
    memberBlockIds: ['combination-a', 'combination-b'],
    name: 'Combination'
  })
  graph.bindQuickExecutionSlot(1, {
    type: 'workflow',
    terminalBlockIds: ['workflow-a', 'workflow-b']
  })
  graph.bindQuickExecutionSlot(2, {
    type: 'combination',
    terminalGroupId: 'combination'
  })
  return graph
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

  snapshot() {
    return this.graph.toSnapshot()
  }

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
