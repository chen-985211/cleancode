import { CreateTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/CreateTerminalGroupUseCase'
import { DissolveTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/DissolveTerminalGroupUseCase'
import { MoveTerminalWorkflowToGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/MoveTerminalWorkflowToGroupUseCase'
import { MoveTerminalGroupUseCase } from '../../../../src/contexts/block-graph/application/use-cases/MoveTerminalGroupUseCase'
import { SetTerminalGroupCollapsedUseCase } from '../../../../src/contexts/block-graph/application/use-cases/SetTerminalGroupCollapsedUseCase'
import { UpdateTerminalGroupMetadataUseCase } from '../../../../src/contexts/block-graph/application/use-cases/UpdateTerminalGroupMetadataUseCase'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { getAppErrorCode } from '../../../../src/shared-kernel/application/errors/AppError'

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
    const candidate = BlockGraph.fromSnapshot(this.savedGraph.toSnapshot())
    const result = await transaction(candidate)
    this.savedGraph = candidate
    return { graph: candidate.toSnapshot(), result }
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

  it('automatically places an empty MCP combination outside Agent and top-level node bounds', async () => {
    const graph = createGraphWithThreeTerminals()
    graph.createTerminalGroup({
      id: 'existing-group',
      name: 'Existing',
      position: { x: 0, y: 800 }
    })
    const repository = new InMemoryBlockGraphRepository(graph)
    const agentRegion = region(0, 0, 280, 520)

    const updatedGraph = await new CreateTerminalGroupUseCase(repository).execute({
      canvasRegions: [agentRegion],
      name: 'Deployment',
      projectDirectory: '/tmp/project',
      workspaceId: 'main'
    })

    const createdGroup = updatedGraph.terminalGroups.find((group) => group.id !== 'existing-group')!
    expect(createdGroup.memberBlockIds).toEqual([])
    expect(overlapsWithGap(createdGroup, agentRegion, 64)).toBe(false)
    expect(updatedGraph.blocks.every((block) => !overlapsWithGap(createdGroup, block, 64))).toBe(
      true
    )
    expect(
      updatedGraph.terminalGroups
        .filter((group) => group.id !== createdGroup.id)
        .every((group) => !overlapsWithGap(createdGroup, group, 64))
    ).toBe(true)
  })

  it('creates a group from one complete workflow', async () => {
    const graph = createGraphWithThreeTerminals()
    graph.connectTerminalBlocks({
      sourceBlockId: 'backend-terminal',
      targetBlockId: 'frontend-terminal'
    })
    const repository = new InMemoryBlockGraphRepository(graph)

    const updatedGraph = await new CreateTerminalGroupUseCase(repository).execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      name: 'Application',
      memberBlockIds: ['frontend-terminal']
    })

    expect(updatedGraph.terminalGroups[0]?.memberBlockIds).toEqual([
      'backend-terminal',
      'frontend-terminal'
    ])
  })

  it('updates terminal group metadata, collapsed state, members, and position', async () => {
    const graph = createGraphWithGroupedTerminals()
    const repository = new InMemoryBlockGraphRepository(graph)
    const updateMetadata = new UpdateTerminalGroupMetadataUseCase(repository)
    const setCollapsed = new SetTerminalGroupCollapsedUseCase(repository)
    const moveTerminalWorkflow = new MoveTerminalWorkflowToGroupUseCase(repository)
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
    await moveTerminalWorkflow.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      targetTerminalGroupId: 'development-group',
      blockId: 'worker-terminal',
      position: { x: 320, y: 700 }
    })
    await moveTerminalWorkflow.execute({
      projectDirectory: '/tmp/project',
      workspaceId: 'main',
      targetTerminalGroupId: null,
      blockId: 'frontend-terminal',
      position: { x: 820, y: 240 }
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

  it('rolls back an MCP membership move when the anchored combination would cover an Agent', async () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    graph.createTerminalBlock({
      description: '',
      id: 'incoming-terminal',
      name: 'Incoming',
      position: { x: 2_000, y: 100 }
    })
    graph.createTerminalGroup({
      id: 'anchored-group',
      name: 'Anchored',
      position: { x: 100, y: 100 }
    })
    const repository = new InMemoryBlockGraphRepository(graph)
    const before = repository.savedGraph?.toSnapshot()

    await expect(
      new MoveTerminalWorkflowToGroupUseCase(repository).execute({
        blockId: 'incoming-terminal',
        canvasRegions: [region(700, 100, 500, 600)],
        projectDirectory: '/tmp/project',
        targetTerminalGroupId: 'anchored-group',
        workspaceId: 'main'
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_GROUP_LAYOUT_CONFLICT'
    )
    expect(repository.savedGraph?.toSnapshot()).toEqual(before)
  })

  it.each([
    {
      createObstacle(graph: BlockGraph) {
        graph.createTerminalBlock({
          description: '',
          id: 'external-terminal',
          name: 'External terminal',
          position: { x: 900, y: 100 }
        })
      },
      obstacle: 'top-level terminal'
    },
    {
      createObstacle(graph: BlockGraph) {
        graph.createTerminalGroup({
          id: 'external-group',
          name: 'External group',
          position: { x: 900, y: 100 }
        })
      },
      obstacle: 'external group'
    }
  ])(
    'rolls back an MCP membership move when the anchored combination would cover an $obstacle',
    async ({ createObstacle }) => {
      const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
      graph.createTerminalBlock({
        description: '',
        id: 'incoming-terminal',
        name: 'Incoming',
        position: { x: 2_000, y: 100 }
      })
      graph.createTerminalGroup({
        id: 'anchored-group',
        name: 'Anchored',
        position: { x: 100, y: 100 }
      })
      createObstacle(graph)
      const repository = new InMemoryBlockGraphRepository(graph)
      const before = repository.savedGraph?.toSnapshot()

      await expect(
        new MoveTerminalWorkflowToGroupUseCase(repository).execute({
          blockId: 'incoming-terminal',
          canvasRegions: [],
          projectDirectory: '/tmp/project',
          targetTerminalGroupId: 'anchored-group',
          workspaceId: 'main'
        })
      ).rejects.toSatisfy(
        (error: unknown) => getAppErrorCode(error) === 'TERMINAL_GROUP_LAYOUT_CONFLICT'
      )
      expect(repository.savedGraph?.toSnapshot()).toEqual(before)
    }
  )

  it('checks every terminal in a complete workflow before moving it out of a combination', async () => {
    const graph = BlockGraph.createDefault({ projectId: 'project-1', workspaceId: 'main' })
    graph.createTerminalBlock({
      description: '',
      id: 'source-terminal',
      name: 'Source',
      position: { x: 100, y: 100 }
    })
    graph.createTerminalBlock({
      description: '',
      id: 'target-terminal',
      name: 'Target',
      position: { x: 900, y: 100 }
    })
    graph.connectTerminalBlocks({
      sourceBlockId: 'source-terminal',
      targetBlockId: 'target-terminal'
    })
    graph.createTerminalGroup({
      id: 'workflow-group',
      memberBlockIds: ['source-terminal'],
      name: 'Workflow',
      position: { x: 100, y: 100 }
    })
    const snapshot = graph.toSnapshot()
    const source = snapshot.blocks.find((block) => block.id === 'source-terminal')!
    const target = snapshot.blocks.find((block) => block.id === 'target-terminal')!
    const leavePosition = { x: 2_000, y: 100 }
    const targetLeavePosition = {
      x: target.position.x + leavePosition.x - source.position.x,
      y: target.position.y + leavePosition.y - source.position.y
    }
    const repository = new InMemoryBlockGraphRepository(graph)
    const before = repository.savedGraph?.toSnapshot()

    await expect(
      new MoveTerminalWorkflowToGroupUseCase(repository).execute({
        blockId: 'source-terminal',
        canvasRegions: [
          region(
            targetLeavePosition.x,
            targetLeavePosition.y,
            target.size.width,
            target.size.height
          )
        ],
        position: leavePosition,
        projectDirectory: '/tmp/project',
        targetTerminalGroupId: null,
        workspaceId: 'main'
      })
    ).rejects.toSatisfy(
      (error: unknown) => getAppErrorCode(error) === 'TERMINAL_GROUP_LAYOUT_CONFLICT'
    )
    expect(repository.savedGraph?.toSnapshot()).toEqual(before)
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

function region(x: number, y: number, width: number, height: number) {
  return { position: { x, y }, size: { width, height } }
}

function overlapsWithGap(
  left: ReturnType<typeof region>,
  right: ReturnType<typeof region>,
  gap: number
): boolean {
  return (
    left.position.x < right.position.x + right.size.width + gap &&
    left.position.x + left.size.width > right.position.x - gap &&
    left.position.y < right.position.y + right.size.height + gap &&
    left.position.y + left.size.height > right.position.y - gap
  )
}
