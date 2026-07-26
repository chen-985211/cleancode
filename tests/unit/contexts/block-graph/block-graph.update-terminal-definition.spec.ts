import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { UpdateTerminalDefinitionUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalDefinitionUseCase'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

describe('update terminal definition', () => {
  it('commits metadata, launch command, and execution configuration atomically', async () => {
    const repository = new TransactionalInMemoryRepository(createGraph())
    const updateDefinition = new UpdateTerminalDefinitionUseCase(repository)

    const graph = await updateDefinition.execute({
      blockId: 'server',
      description: 'Runs the local API',
      executionConfig: {
        mode: 'service',
        port: {
          binding: { type: 'environment', variableName: 'PORT' },
          policy: { port: 4_173, type: 'preferred' },
          protocol: 'http'
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      },
      launchCommand: ' pnpm dev ',
      name: ' API Server ',
      projectDirectory: '/project',
      workspaceId: 'main'
    })

    expect(graph.blocks[0]).toMatchObject({
      description: 'Runs the local API',
      executionConfig: {
        mode: 'service',
        port: {
          binding: { type: 'environment', variableName: 'PORT' },
          policy: { port: 4_173, type: 'preferred' },
          protocol: 'http'
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      },
      launchCommand: 'pnpm dev',
      name: 'API Server'
    })
  })

  it('keeps the complete previous definition when any field is invalid', async () => {
    const repository = new TransactionalInMemoryRepository(createGraph())
    const updateDefinition = new UpdateTerminalDefinitionUseCase(repository)
    const before = await repository.findDefaultGraphSnapshot('/project', 'main')

    await expect(
      updateDefinition.execute({
        blockId: 'server',
        description: 'must not persist',
        executionConfig: {
          mode: 'service',
          port: {
            binding: { type: 'none' },
            policy: { type: 'auto' },
            protocol: 'http'
          },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        },
        launchCommand: 'must-not-persist',
        name: 'Must Not Persist',
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).rejects.toMatchObject({ code: 'TERMINAL_EXECUTION_CONFIG_INVALID' })

    await expect(repository.findDefaultGraphSnapshot('/project', 'main')).resolves.toEqual(before)
  })
})

class TransactionalInMemoryRepository implements BlockGraphRepository {
  constructor(private graph: BlockGraph) {}

  async initializeDefaultGraph() {
    return this.graph.toSnapshot()
  }

  async findDefaultGraph(_projectDirectory: string, _workspaceId: string) {
    void _projectDirectory
    void _workspaceId
    return BlockGraph.fromSnapshot(this.graph.toSnapshot())
  }

  async findDefaultGraphSnapshot(_projectDirectory: string, _workspaceId: string) {
    void _projectDirectory
    void _workspaceId
    return this.graph.toSnapshot()
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    const candidate = BlockGraph.fromSnapshot(this.graph.toSnapshot())
    const result = await transaction(candidate)
    this.graph = candidate
    return { graph: this.graph.toSnapshot(), result }
  }
}

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })
  graph.createTerminalBlock({
    id: 'server',
    description: 'Old description',
    launchCommand: 'old-command',
    name: 'Old Server',
    position: { x: 0, y: 0 }
  })
  return graph
}
