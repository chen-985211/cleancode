import { AddTerminalToGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/AddTerminalToGroupUseCase'
import { CreateTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalGroupUseCase'
import { DissolveTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DissolveTerminalGroupUseCase'
import { MoveTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/MoveTerminalGroupUseCase'
import { RemoveTerminalFromGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/RemoveTerminalFromGroupUseCase'
import { SetTerminalGroupCollapsedUseCase } from '../../../../src/contexts/block-graph/application/use-cases/SetTerminalGroupCollapsedUseCase'
import { UpdateTerminalGroupMetadataUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalGroupMetadataUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'

class InMemoryBlockGraphRepository implements BlockGraphRepository {
  savedGraph: BlockGraph | null = null

  constructor(initialGraph: BlockGraph) {
    this.savedGraph = initialGraph
  }

  async initializeDefaultGraph(_projectDirectory: string, graph: BlockGraph) {
    this.savedGraph = graph
    return graph.toSnapshot()
  }

  async findDefaultGraph(): Promise<BlockGraph | null> {
    return this.savedGraph
  }

  async findDefaultGraphSnapshot() {
    return this.savedGraph?.toSnapshot() ?? null
  }

  async transactDefaultGraph<TResult>(
    _projectDirectory: string,
    _workspaceId: string,
    transaction: (graph: BlockGraph) => TResult | Promise<TResult>
  ) {
    if (!this.savedGraph) return null
    const result = await transaction(this.savedGraph)
    return { graph: this.savedGraph.toSnapshot(), result }
  }
}

describe('terminal group use cases', () => {
  it('creates a terminal group and persists it', async () => {
    const graph = createGraphWithThreeTerminals()
    const repository = new InMemoryBlockGraphRepository(graph)
    const createTerminalGroup = new CreateTerminalGroupUseCase(repository)

    const updatedGraph = await createTerminalGroup.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      name: '启动项目',
      memberBlockIds: ['backend-terminal', 'frontend-terminal']
    })

    expect(updatedGraph.terminalGroups).toEqual([
      expect.objectContaining({
        name: '启动项目',
        memberBlockIds: ['backend-terminal', 'frontend-terminal']
      })
    ])
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })

  it('rejects creating a group from one complete workflow', async () => {
    const graph = createGraphWithThreeTerminals()
    graph.connectTerminalBlocks({
      sourceBlockId: 'backend-terminal',
      targetBlockId: 'frontend-terminal'
    })
    const repository = new InMemoryBlockGraphRepository(graph)

    await expect(
      new CreateTerminalGroupUseCase(repository).execute({
        projectDirectory: '/tmp/project',
        workspaceId: 'main',
        name: 'Application',
        memberBlockIds: ['frontend-terminal']
      })
    ).rejects.toThrow('Terminal group must contain at least two top-level execution units.')
    expect(repository.savedGraph?.terminalGroups).toEqual([])
  })

  it('updates terminal group metadata, collapsed state, members, and position', async () => {
    const graph = createGraphWithGroupedTerminals()
    const repository = new InMemoryBlockGraphRepository(graph)
    const updateMetadata = new UpdateTerminalGroupMetadataUseCase(repository)
    const setCollapsed = new SetTerminalGroupCollapsedUseCase(repository)
    const addTerminal = new AddTerminalToGroupUseCase(repository)
    const removeTerminal = new RemoveTerminalFromGroupUseCase(repository)
    const moveTerminalGroup = new MoveTerminalGroupUseCase(repository)

    await updateMetadata.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group',
      name: '开发环境'
    })
    await setCollapsed.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group',
      isCollapsed: true
    })
    await addTerminal.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group',
      blockId: 'worker-terminal'
    })
    await removeTerminal.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group',
      blockId: 'frontend-terminal'
    })
    const updatedGraph = await moveTerminalGroup.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group',
      position: { x: 360, y: 300 }
    })

    expect(updatedGraph.terminalGroups).toEqual([
      expect.objectContaining({
        id: 'development-group',
        name: '开发环境',
        isCollapsed: true,
        position: { x: 360, y: 300 },
        memberBlockIds: ['backend-terminal', 'worker-terminal']
      })
    ])
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })

  it('dissolves a terminal group without deleting member terminals', async () => {
    const graph = createGraphWithGroupedTerminals()
    const repository = new InMemoryBlockGraphRepository(graph)
    const dissolveTerminalGroup = new DissolveTerminalGroupUseCase(repository)

    const updatedGraph = await dissolveTerminalGroup.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      terminalGroupId: 'development-group'
    })

    expect(updatedGraph.terminalGroups).toEqual([])
    expect(updatedGraph.blocks.map((block) => block.id)).toEqual([
      'backend-terminal',
      'frontend-terminal',
      'worker-terminal'
    ])
    expect(repository.savedGraph?.toSnapshot()).toEqual(updatedGraph)
  })
})

function createGraphWithGroupedTerminals(): BlockGraph {
  const graph = createGraphWithThreeTerminals()

  graph.createTerminalGroup({
    id: 'development-group',
    name: '启动项目',
    memberBlockIds: ['backend-terminal', 'frontend-terminal']
  })

  return graph
}

function createGraphWithThreeTerminals(): BlockGraph {
  const graph = BlockGraph.createDefault({
    projectId: 'project-1',
    workspaceId: 'main'
  })

  graph.createTerminalBlock({
    id: 'backend-terminal',
    name: 'Backend',
    description: 'Runs the API server.',
    position: { x: 320, y: 240 }
  })
  graph.createTerminalBlock({
    id: 'frontend-terminal',
    name: 'Frontend',
    description: 'Runs the web server.',
    position: { x: 820, y: 240 }
  })
  graph.createTerminalBlock({
    id: 'worker-terminal',
    name: 'Worker',
    description: 'Runs background jobs.',
    position: { x: 320, y: 700 }
  })

  return graph
}
