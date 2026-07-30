import { GetTerminalLaunchPlanUseCase } from '../../../../src/contexts/block-graph/application/use-cases/GetTerminalLaunchPlanUseCase'
import { BuildTerminalWorkflowPlanUseCase } from '../../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { BlockGraphTerminalLaunchPlanAdapter } from '../../../../src/contexts/run/infrastructure/block-graph/BlockGraphTerminalLaunchPlanAdapter'
import { BlockGraphTerminalWorkflowPlanAdapter } from '../../../../src/contexts/run/infrastructure/block-graph/BlockGraphTerminalWorkflowPlanAdapter'

describe('BlockGraph terminal launch plan adapter', () => {
  it('maps the selected BlockGraph definition into an immutable Run-owned plan', async () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
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
    const adapter = new BlockGraphTerminalLaunchPlanAdapter(
      new GetTerminalLaunchPlanUseCase(new InMemoryRepository(graph))
    )

    const plan = await adapter.getPlan({
      projectId: 'project-1',
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
  })

  it('maps a workflow through an immutable Run-owned DTO boundary', async () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    graph.createTerminalBlock({
      id: 'api',
      name: 'API',
      description: 'API service',
      launchCommand: 'pnpm dev',
      position: { x: 0, y: 0 }
    })
    graph.createTerminalBlock({
      id: 'browser',
      name: 'Browser',
      description: 'Browser task',
      launchCommand: 'pnpm test:e2e',
      position: { x: 320, y: 0 }
    })
    graph.connectTerminalBlocks({ sourceBlockId: 'api', targetBlockId: 'browser' })
    const adapter = new BlockGraphTerminalWorkflowPlanAdapter(
      new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))
    )

    const workflow = await adapter.buildPlan({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'full' }
    })

    expect(workflow.nodes.map((node) => node.blockId)).toEqual(['api', 'browser'])
    expect(workflow.nodes[1]?.dependencyBlockIds).toEqual(['api'])
    expect(Object.isFrozen(workflow)).toBe(true)
    expect(Object.isFrozen(workflow.nodes)).toBe(true)
    expect(Object.isFrozen(workflow.nodes[1]?.dependencyBlockIds)).toBe(true)
  })

  it('maps a terminal combination as an exact member-scoped workflow plan', async () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    for (const blockId of ['install', 'build', 'companion', 'outside']) {
      graph.createTerminalBlock({
        id: blockId,
        name: blockId,
        description: `${blockId} task`,
        launchCommand: `run ${blockId}`,
        position: { x: 0, y: 0 }
      })
    }
    graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })
    graph.createTerminalGroup({
      id: 'development',
      name: 'Development',
      memberBlockIds: ['install', 'build', 'companion']
    })
    graph.connectTerminalBlocks({ sourceBlockId: 'build', targetBlockId: 'outside' })
    const adapter = new BlockGraphTerminalWorkflowPlanAdapter(
      new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))
    )

    const workflow = await adapter.buildPlan({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'terminal-group', terminalGroupId: 'development' }
    })

    expect(workflow.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      ['install', []],
      ['build', ['install']],
      ['companion', []]
    ])
  })
})

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
