import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { buildTerminalWorkflowPlan } from '../../../../src/contexts/block-graph/domain/services/TerminalWorkflowPlan'
import { BuildTerminalWorkflowPlanUseCase } from '../../../../src/contexts/block-graph/application/use-cases/BuildTerminalWorkflowPlanUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'

describe('build terminal workflow plan', () => {
  it('builds a stable full plan with parallel roots and fan-in dependencies', async () => {
    const graph = createBuildGraph()
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'full' }
    })

    expect(plan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      ['install-api', []],
      ['install-web', []],
      ['build', ['install-api', 'install-web']],
      ['test', ['build']]
    ])
    expect(plan.nodes[0]).toMatchObject({
      name: 'Install API',
      launchCommand: 'pnpm install --filter api',
      executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
    })
    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.nodes)).toBe(true)
    expect(Object.isFrozen(plan.nodes[2]?.dependencyBlockIds)).toBe(true)
  })

  it('builds a from-here plan containing the start node and its descendants only', async () => {
    const graph = createBuildGraph()
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'from-block', blockId: 'build' }
    })

    expect(plan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      ['build', []],
      ['test', ['build']]
    ])
  })

  it('copies and deeply freezes the service port intent in the immutable plan', async () => {
    const graph = createBuildGraph()
    graph.updateTerminalExecutionConfig('build', {
      mode: 'service',
      port: {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { port: 5_173, type: 'preferred' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'from-block', blockId: 'build' }
    })
    const config = plan.nodes[0]?.executionConfig

    expect(config).toEqual({
      mode: 'service',
      port: {
        binding: { type: 'environment', variableName: 'PORT' },
        policy: { port: 5_173, type: 'preferred' },
        protocol: 'http'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
    expect(config && Object.isFrozen(config)).toBe(true)
    expect(config?.mode === 'service' && Object.isFrozen(config.port)).toBe(true)
    expect(config?.mode === 'service' && Object.isFrozen(config.port?.policy)).toBe(true)
    expect(config?.mode === 'service' && Object.isFrozen(config.port?.binding)).toBe(true)
  })

  it('ignores unconfigured isolated terminals in a full plan', async () => {
    const graph = createBuildGraph()
    graph.createTerminalBlock({
      id: 'scratch',
      name: 'Scratch',
      description: 'Interactive shell only.',
      position: { x: 0, y: 0 }
    })
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'full' }
    })

    expect(plan.nodes.map((node) => node.blockId)).not.toContain('scratch')
  })

  it('rejects connected terminals without a launch command', async () => {
    const graph = createBuildGraph()
    graph.updateTerminalBlockMetadata('build', {
      name: 'Build',
      description: 'Build all packages.',
      launchCommand: ''
    })
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    await expect(
      buildPlan.execute({
        projectDirectory: '/project',
        workspaceId: 'main',
        scope: { type: 'full' }
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_WORKFLOW_COMMAND_MISSING'
    )
  })

  it('builds a terminal combination plan with parallel standalone roots and preserved flow order', async () => {
    const graph = createCombinationGraph()
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'terminal-group', terminalGroupId: 'development' }
    })

    expect(plan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      ['standalone', []],
      ['install', []],
      ['build', ['install']]
    ])
    expect(plan.nodes.map((node) => node.blockId)).not.toContain('outside')
  })

  it('keeps independent flows intact inside the same terminal combination plan', async () => {
    const graph = BlockGraph.createDefault({
      id: 'graph-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    for (const blockId of ['install', 'build', 'api', 'browser']) {
      createConfiguredTerminal(graph, blockId, blockId, `run ${blockId}`)
    }
    graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })
    graph.connectTerminalBlocks({ sourceBlockId: 'api', targetBlockId: 'browser' })
    graph.createTerminalGroup({
      id: 'development',
      name: 'Development',
      memberBlockIds: ['install', 'build', 'api', 'browser']
    })
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    const plan = await buildPlan.execute({
      projectDirectory: '/project',
      workspaceId: 'main',
      scope: { type: 'terminal-group', terminalGroupId: 'development' }
    })

    expect(plan.nodes.map((node) => [node.blockId, node.dependencyBlockIds])).toEqual([
      ['install', []],
      ['build', ['install']],
      ['api', []],
      ['browser', ['api']]
    ])
  })

  it('rejects a terminal combination before execution when any member has no launch command', async () => {
    const graph = createCombinationGraph()
    graph.updateTerminalBlockMetadata('standalone', {
      name: 'Standalone',
      description: 'Standalone.',
      launchCommand: ''
    })
    const buildPlan = new BuildTerminalWorkflowPlanUseCase(new InMemoryRepository(graph))

    await expect(
      buildPlan.execute({
        projectDirectory: '/project',
        workspaceId: 'main',
        scope: { type: 'terminal-group', terminalGroupId: 'development' }
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_WORKFLOW_COMMAND_MISSING'
    )
  })

  it('defensively rejects a cyclic terminal combination snapshot', () => {
    const graph = createCombinationGraph()
    const snapshot = graph.toSnapshot()

    expect(() =>
      buildTerminalWorkflowPlan(
        {
          ...snapshot,
          connections: [
            { id: 'install-to-build', sourceBlockId: 'install', targetBlockId: 'build' },
            { id: 'build-to-install', sourceBlockId: 'build', targetBlockId: 'install' }
          ]
        },
        { type: 'terminal-group', terminalGroupId: 'development' }
      )
    ).toThrowError(
      expect.objectContaining({
        code: 'TERMINAL_WORKFLOW_CYCLE'
      })
    )
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

function createBuildGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })

  createConfiguredTerminal(graph, 'install-api', 'Install API', 'pnpm install --filter api')
  createConfiguredTerminal(graph, 'install-web', 'Install Web', 'pnpm install --filter web')
  createConfiguredTerminal(graph, 'build', 'Build', 'pnpm build')
  createConfiguredTerminal(graph, 'test', 'Test', 'pnpm test')
  graph.connectTerminalBlocks({ sourceBlockId: 'install-api', targetBlockId: 'build' })
  graph.connectTerminalBlocks({ sourceBlockId: 'install-web', targetBlockId: 'build' })
  graph.connectTerminalBlocks({ sourceBlockId: 'build', targetBlockId: 'test' })

  return graph
}

function createCombinationGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })

  createConfiguredTerminal(graph, 'standalone', 'Standalone', 'pnpm dev')
  createConfiguredTerminal(graph, 'install', 'Install', 'pnpm install')
  createConfiguredTerminal(graph, 'build', 'Build', 'pnpm build')
  createConfiguredTerminal(graph, 'outside', 'Outside', 'pnpm outside')
  graph.connectTerminalBlocks({ sourceBlockId: 'install', targetBlockId: 'build' })
  graph.connectTerminalBlocks({ sourceBlockId: 'build', targetBlockId: 'outside' })
  graph.createTerminalGroup({
    id: 'development',
    name: 'Development',
    memberBlockIds: ['standalone', 'install', 'build']
  })

  return graph
}

function createConfiguredTerminal(
  graph: BlockGraph,
  id: string,
  name: string,
  launchCommand: string
): void {
  graph.createTerminalBlock({
    id,
    name,
    description: `${name}.`,
    position: { x: 0, y: 0 }
  })
  graph.updateTerminalBlockMetadata(id, {
    name,
    description: `${name}.`,
    launchCommand
  })
}
