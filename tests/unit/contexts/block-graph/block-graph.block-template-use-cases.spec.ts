import { BlockGraph } from '../../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { BlockTemplateLibrary } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateLibrary'
import type { BlockTemplateLibrarySnapshot } from '../../../../src/contexts/block-graph/domain/aggregates/BlockTemplateTypes'
import type { BlockGraphRepository } from '../../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import type { BlockTemplateRepository } from '../../../../src/contexts/block-graph/application/ports/BlockTemplateRepository'
import { SaveBlockTemplateUseCase } from '../../../../src/contexts/block-graph/application/use-cases/SaveBlockTemplateUseCase'
import { ListBlockTemplatesUseCase } from '../../../../src/contexts/block-graph/application/use-cases/ListBlockTemplatesUseCase'
import { InstantiateBlockTemplateUseCase } from '../../../../src/contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'

describe('block template use cases', () => {
  it('saves from the authoritative graph and lists only the requested scope', async () => {
    const graph = createGraph('project-1')
    const templates = new InMemoryTemplateRepository()
    const save = new SaveBlockTemplateUseCase(new InMemoryGraphRepository(graph), templates, {
      createId: () => 'template-1',
      now: () => '2026-07-30T08:00:00.000Z'
    })

    const saved = await save.execute({
      description: 'Build workflow.',
      name: 'Build',
      projectDirectory: '/project',
      scope: { projectId: 'project-1', type: 'project' },
      selectedBlockIds: ['install', 'build'],
      workspaceId: 'workspace-1'
    })

    expect(saved.type).toBe('workflow')
    await templates.transact((library) => {
      library.add({
        ...saved,
        id: 'global-template',
        scope: { type: 'global' }
      })
    })
    const list = new ListBlockTemplatesUseCase(templates)

    await expect(
      list.execute({ scope: { projectId: 'project-1', type: 'project' } })
    ).resolves.toEqual([saved])
    await expect(list.execute({ scope: { type: 'global' } })).resolves.toEqual([
      expect.objectContaining({ id: 'global-template' })
    ])
  })

  it('rejects saving a project template into a different project scope', async () => {
    const save = new SaveBlockTemplateUseCase(
      new InMemoryGraphRepository(createGraph('project-1')),
      new InMemoryTemplateRepository(),
      {
        createId: () => 'template-1',
        now: () => '2026-07-30T08:00:00.000Z'
      }
    )

    await expect(
      save.execute({
        description: '',
        name: 'Build',
        projectDirectory: '/project',
        scope: { projectId: 'project-2', type: 'project' },
        selectedBlockIds: ['install', 'build'],
        workspaceId: 'workspace-1'
      })
    ).rejects.toMatchObject({ code: 'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID' })
  })

  it('instantiates a visible template atomically into the target graph', async () => {
    const graph = createGraph('project-1')
    const templates = new InMemoryTemplateRepository()
    const save = new SaveBlockTemplateUseCase(new InMemoryGraphRepository(graph), templates, {
      createId: () => 'template-1',
      now: () => '2026-07-30T08:00:00.000Z'
    })
    await save.execute({
      description: '',
      name: 'Build',
      projectDirectory: '/project',
      scope: { projectId: 'project-1', type: 'project' },
      selectedBlockIds: ['install', 'build'],
      workspaceId: 'workspace-1'
    })
    const targetGraph = BlockGraph.createDefault({
      id: 'target-graph',
      projectId: 'project-1',
      workspaceId: 'workspace-2'
    })
    const instantiate = new InstantiateBlockTemplateUseCase(
      new InMemoryGraphRepository(targetGraph),
      templates
    )

    const result = await instantiate.execute({
      origin: { x: 800, y: 500 },
      projectDirectory: '/project',
      templateId: 'template-1',
      workspaceId: 'workspace-2'
    })

    expect(result.graph.blocks).toHaveLength(2)
    expect(result.graph.connections).toHaveLength(1)
    expect(result.instance.blockIds).toEqual(result.graph.blocks.map((block) => block.id))
    expect(result.instance.executionScope).toEqual({
      blockIds: result.instance.blockIds,
      type: 'block-set'
    })
  })

  it('does not apply a project template to another project', async () => {
    const templates = new InMemoryTemplateRepository()
    const library = BlockTemplateLibrary.empty()
    library.add({
      id: 'template-1',
      type: 'terminal',
      name: 'API',
      description: '',
      scope: { projectId: 'project-1', type: 'project' },
      createdAt: '2026-07-30T08:00:00.000Z',
      updatedAt: '2026-07-30T08:00:00.000Z',
      nodes: [
        {
          templateNodeId: 'template-node-1',
          name: 'API',
          description: '',
          launchCommand: 'pnpm api',
          executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
          position: { x: 0, y: 0 },
          size: { width: 640, height: 360 }
        }
      ],
      connections: []
    })
    templates.snapshot = library.toSnapshot()
    const targetGraph = BlockGraph.createDefault({
      id: 'target-graph',
      projectId: 'project-2',
      workspaceId: 'workspace-2'
    })

    await expect(
      new InstantiateBlockTemplateUseCase(
        new InMemoryGraphRepository(targetGraph),
        templates
      ).execute({
        origin: { x: 0, y: 0 },
        projectDirectory: '/other-project',
        templateId: 'template-1',
        workspaceId: 'workspace-2'
      })
    ).rejects.toMatchObject({ code: 'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID' })
    expect(targetGraph.toSnapshot().blocks).toEqual([])
  })
})

class InMemoryTemplateRepository implements BlockTemplateRepository {
  snapshot: BlockTemplateLibrarySnapshot = BlockTemplateLibrary.empty().toSnapshot()

  async get(): Promise<BlockTemplateLibrarySnapshot> {
    return this.snapshot
  }

  async transact<TResult>(
    transaction: (library: BlockTemplateLibrary) => TResult | Promise<TResult>
  ) {
    const library = BlockTemplateLibrary.restore(this.snapshot)
    const result = await transaction(library)
    this.snapshot = library.toSnapshot()
    return { library: this.snapshot, result }
  }
}

class InMemoryGraphRepository implements BlockGraphRepository {
  constructor(private readonly graph: BlockGraph) {}

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
    const result = await transaction(this.graph)
    return { graph: this.graph.toSnapshot(), result }
  }
}

function createGraph(projectId: string): BlockGraph {
  const graph = BlockGraph.createDefault({
    id: 'graph-1',
    projectId,
    workspaceId: 'workspace-1'
  })
  graph.createTerminalBlock({
    id: 'install',
    name: 'Install',
    description: '',
    launchCommand: 'pnpm install',
    position: { x: 100, y: 100 }
  })
  graph.createTerminalBlock({
    id: 'build',
    name: 'Build',
    description: '',
    launchCommand: 'pnpm build',
    position: { x: 900, y: 100 }
  })
  graph.connectTerminalBlocks({
    id: 'install-build',
    sourceBlockId: 'install',
    targetBlockId: 'build'
  })

  return graph
}
