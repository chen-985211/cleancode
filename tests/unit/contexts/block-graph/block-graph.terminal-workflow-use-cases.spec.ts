import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { ConnectTerminalBlocksUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ConnectTerminalBlocksUseCase'
import { DisconnectTerminalBlocksUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DisconnectTerminalBlocksUseCase'
import { UpdateTerminalExecutionConfigUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalExecutionConfigUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'

describe('terminal workflow graph commands', () => {
  it('persists connections, disconnections, and execution configuration', async () => {
    const repository = new TrackingRepository(createGraph())
    const connect = new ConnectTerminalBlocksUseCase(repository)
    const disconnect = new DisconnectTerminalBlocksUseCase(repository)
    const updateConfig = new UpdateTerminalExecutionConfigUseCase(repository)

    const connected = await connect.execute({
      projectDirectory: '/project',
      workspaceName: 'main',
      sourceBlockId: 'install',
      targetBlockId: 'build'
    })
    const connectionId = connected.connections?.[0]?.id

    await updateConfig.execute({
      projectDirectory: '/project',
      workspaceName: 'main',
      blockId: 'build',
      executionConfig: {
        mode: 'service',
        port: {
          binding: { type: 'none' },
          policy: { port: 4173, type: 'fixed' },
          protocol: 'tcp'
        },
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000
      }
    })
    const disconnected = await disconnect.execute({
      projectDirectory: '/project',
      workspaceName: 'main',
      connectionId: connectionId ?? ''
    })

    expect(disconnected.connections).toEqual([])
    expect(disconnected.blocks[1]?.executionConfig).toEqual({
      mode: 'service',
      port: {
        binding: { type: 'none' },
        policy: { port: 4173, type: 'fixed' },
        protocol: 'tcp'
      },
      readiness: { type: 'tcp' },
      readinessTimeoutMs: 30_000
    })
    expect(repository.transactionCount).toBe(3)
  })
})

class TrackingRepository implements BlockGraphRepository {
  transactionCount = 0

  constructor(private graph: BlockGraph) {}

  async transactDefaultGraph<TResult>(
    _directory: string,
    _workspaceName: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    const result = await transaction(this.graph)
    this.transactionCount += 1
    return { graph: this.graph.toSnapshot(), result }
  }

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    return graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph> {
    return this.graph
  }

  async findDefaultGraphSnapshot() {
    return this.graph.toSnapshot()
  }
}

function createGraph(): BlockGraph {
  const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceName: 'main' })

  for (const id of ['install', 'build']) {
    graph.createTerminalBlock({
      id,
      name: id,
      description: id,
      position: { x: 0, y: 0 }
    })
  }

  return graph
}
