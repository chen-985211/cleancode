import { AddQuickExecutionTargetUseCase } from '../../../../src/contexts/block-graph/application/use-cases/AddQuickExecutionTargetUseCase'
import { BindQuickExecutionSlotUseCase } from '../../../../src/contexts/block-graph/application/use-cases/BindQuickExecutionSlotUseCase'
import { ClearQuickExecutionSlotUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ClearQuickExecutionSlotUseCase'
import { ReorderQuickExecutionSlotsUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ReorderQuickExecutionSlotsUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

class InMemoryBlockGraphRepository implements BlockGraphRepository {
  constructor(private graph: BlockGraph) {}

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    this.graph = graph
    return graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
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
    const result = await transaction(this.graph)
    return { graph: this.graph.toSnapshot(), result }
  }
}

describe('block graph quick execution slots', () => {
  it('creates exactly five empty workspace slots', () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })

    expect(graph.quickExecutionSlots).toEqual([
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ])
  })

  it('binds terminal, complete workflow, and combination targets through one use case', async () => {
    const graph = createGraph()
    const repository = new InMemoryBlockGraphRepository(graph)
    const bind = new BindQuickExecutionSlotUseCase(repository)

    await bind.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      number: 1,
      target: { type: 'terminal', terminalBlockId: 'worker' }
    })
    await bind.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      number: 2,
      target: { type: 'workflow', terminalBlockIds: ['web', 'api'] }
    })
    const snapshot = await bind.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      number: 3,
      target: { type: 'combination', terminalGroupId: 'development' }
    })

    expect(snapshot.quickExecutionSlots).toEqual([
      {
        number: 1,
        target: { type: 'terminal', terminalBlockId: 'worker' }
      },
      {
        number: 2,
        target: { type: 'workflow', terminalBlockIds: ['api', 'web'] }
      },
      {
        number: 3,
        target: { type: 'combination', terminalGroupId: 'development' }
      },
      { number: 4, target: null },
      { number: 5, target: null }
    ])
  })

  it('adds a target to the lowest-numbered empty slot without a caller-selected position', async () => {
    const graph = createGraph()
    graph.bindQuickExecutionSlot(1, { type: 'terminal', terminalBlockId: 'worker' })
    graph.bindQuickExecutionSlot(2, {
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
    graph.clearQuickExecutionSlot(1)
    const repository = new InMemoryBlockGraphRepository(graph)

    const snapshot = await new AddQuickExecutionTargetUseCase(repository).execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      target: { type: 'combination', terminalGroupId: 'development' }
    })

    expect(snapshot.quickExecutionSlots?.[0]?.target).toEqual({
      type: 'combination',
      terminalGroupId: 'development'
    })
    expect(snapshot.quickExecutionSlots?.[1]?.target).toEqual({
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
  })

  it('rejects automatic addition when all five slots are occupied', () => {
    const graph = createGraph()
    for (const number of [1, 2, 3, 4, 5]) {
      graph.bindQuickExecutionSlot(number, {
        type: 'terminal',
        terminalBlockId: 'worker'
      })
    }

    expect(() =>
      graph.addQuickExecutionTarget({
        type: 'terminal',
        terminalBlockId: 'worker'
      })
    ).toThrow('Quick execution bar is full.')
  })

  it('reorders shortcut assignments by swapping the dragged and destination slots', async () => {
    const graph = createGraph()
    graph.bindQuickExecutionSlot(1, { type: 'terminal', terminalBlockId: 'worker' })
    graph.bindQuickExecutionSlot(2, {
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
    const repository = new InMemoryBlockGraphRepository(graph)

    const snapshot = await new ReorderQuickExecutionSlotsUseCase(repository).execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      sourceNumber: 1,
      destinationNumber: 2
    })

    expect(snapshot.quickExecutionSlots?.[0]?.target).toEqual({
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
    expect(snapshot.quickExecutionSlots?.[1]?.target).toEqual({
      type: 'terminal',
      terminalBlockId: 'worker'
    })
  })

  it('rejects a partial workflow binding', () => {
    const graph = createGraph()

    expect(() =>
      graph.bindQuickExecutionSlot(1, {
        type: 'workflow',
        terminalBlockIds: ['api']
      })
    ).toThrow('Quick execution workflow must reference one complete workflow.')
  })

  it('clears a filled slot without changing the other slots', async () => {
    const graph = createGraph()
    graph.bindQuickExecutionSlot(1, { type: 'terminal', terminalBlockId: 'worker' })
    graph.bindQuickExecutionSlot(2, {
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
    const repository = new InMemoryBlockGraphRepository(graph)

    const snapshot = await new ClearQuickExecutionSlotUseCase(repository).execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      number: 1
    })

    expect(snapshot.quickExecutionSlots?.[0]).toEqual({ number: 1, target: null })
    expect(snapshot.quickExecutionSlots?.[1]?.target).toEqual({
      type: 'workflow',
      terminalBlockIds: ['api', 'web']
    })
  })

  it('retains restored bindings whose targets no longer exist', () => {
    const graph = BlockGraph.fromSnapshot({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main',
      blocks: [],
      quickExecutionSlots: [
        {
          number: 1,
          target: { type: 'terminal', terminalBlockId: 'removed-terminal' }
        },
        { number: 2, target: null },
        { number: 3, target: null },
        { number: 4, target: null },
        { number: 5, target: null }
      ]
    })

    expect(graph.quickExecutionSlots[0]?.target).toEqual({
      type: 'terminal',
      terminalBlockId: 'removed-terminal'
    })
  })
})

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
  for (const [id, x] of [
    ['api', 0],
    ['web', 600],
    ['worker', 1_200]
  ] as const) {
    graph.createTerminalBlock({
      id,
      name: id,
      description: '',
      position: { x, y: 0 }
    })
  }
  graph.connectTerminalBlocks({
    id: 'api-before-web',
    sourceBlockId: 'api',
    targetBlockId: 'web'
  })
  graph.createTerminalGroup({
    id: 'development',
    name: 'Development',
    memberBlockIds: ['api', 'worker']
  })
  return graph
}
