import { GetTerminalLaunchPlanUseCase } from '../../../../src/contexts/block-graph/application/use-cases/GetTerminalLaunchPlanUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('get terminal launch plan', () => {
  it('returns only the selected terminal definition even when a descendant is incomplete', async () => {
    const graph = createGraph()
    const useCase = new GetTerminalLaunchPlanUseCase(new InMemoryRepository(graph))

    const plan = await useCase.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      blockId: 'api'
    })

    expect(plan).toEqual({
      blockId: 'api',
      launchCommand: 'pnpm dev',
      executionConfig: {
        mode: 'service',
        port: {
          protocol: 'http',
          policy: { type: 'preferred', port: 3_000 },
          binding: { type: 'environment', variableName: 'PORT' }
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      }
    })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.executionConfig)).toBe(true)
    expect(
      plan.executionConfig.mode === 'service' && Object.isFrozen(plan.executionConfig.port)
    ).toBe(true)
  })

  it('rejects an unknown terminal or a selected terminal without a launch command', async () => {
    const useCase = new GetTerminalLaunchPlanUseCase(new InMemoryRepository(createGraph()))

    await expect(
      useCase.execute({
        projectDirectory: '/project',
        workspaceId: 'main',
        blockId: 'missing'
      })
    ).rejects.toMatchObject({ code: 'TERMINAL_BLOCK_NOT_FOUND' })
    await expect(
      useCase.execute({
        projectDirectory: '/project',
        workspaceId: 'main',
        blockId: 'web'
      })
    ).rejects.toMatchObject({ code: 'TERMINAL_WORKFLOW_COMMAND_MISSING' })
  })
})

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })
  graph.createTerminalBlock({
    id: 'api',
    name: 'API',
    description: 'API service',
    launchCommand: 'pnpm dev',
    position: { x: 0, y: 0 }
  })
  graph.updateTerminalExecutionConfig('api', {
    mode: 'service',
    port: {
      protocol: 'http',
      policy: { type: 'preferred', port: 3_000 },
      binding: { type: 'environment', variableName: 'PORT' }
    },
    readiness: { type: 'tcp' },
    readinessTimeoutMs: 30_000
  })
  graph.createTerminalBlock({
    id: 'web',
    name: 'Web',
    description: 'Incomplete downstream',
    position: { x: 0, y: 0 }
  })
  graph.connectTerminalBlocks({ sourceBlockId: 'api', targetBlockId: 'web' })
  return graph
}

class InMemoryRepository implements BlockGraphRepository {
  constructor(private readonly graph: BlockGraph) {}

  async initializeDefaultGraph() {
    return this.graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph> {
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
