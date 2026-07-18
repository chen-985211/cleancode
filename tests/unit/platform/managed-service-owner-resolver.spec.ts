import type { BlockGraphRepository } from '../../../src/contexts/block-graph/application/ports/BlockGraphRepository'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { ProjectRepository } from '../../../src/contexts/project/application/ports/ProjectRepository'
import type { ProjectSnapshot } from '../../../src/contexts/project/application/dto/ProjectSnapshot'
import {
  createManagedServiceOwnerResolver,
  type ManagedServiceOwnerReference
} from '../../../src/platform/electron-main/managedServiceOwnerResolver'

const owner: ManagedServiceOwnerReference = {
  projectId: 'project-1',
  projectDirectory: '/repo/cleancode',
  workspaceName: 'feature/ports',
  blockId: 'terminal-dev',
  sessionId: 'session-1',
  runId: 'run-1',
  generation: 3
}

describe('Managed service owner resolver', () => {
  it('resolves user-facing labels from read-only Project and BlockGraph snapshots', async () => {
    const projects = createProjectRepository(createProjectSnapshot())
    const graphs = createBlockGraphRepository(createGraphSnapshot())

    await expect(createManagedServiceOwnerResolver(projects, graphs)(owner)).resolves.toEqual({
      identity: {
        projectId: owner.projectId,
        workspaceName: owner.workspaceName,
        blockId: owner.blockId,
        sessionId: owner.sessionId,
        runId: owner.runId,
        generation: owner.generation
      },
      projectName: 'CleanCode',
      workspaceName: owner.workspaceName,
      terminalName: 'Development server'
    })

    expect(projects.findByDirectory).toHaveBeenCalledWith(owner.projectDirectory)
    expect(graphs.findDefaultGraphSnapshot).toHaveBeenCalledWith(
      owner.projectDirectory,
      owner.workspaceName
    )
    expect(projects.save).not.toHaveBeenCalled()
    expect(graphs.initializeDefaultGraph).not.toHaveBeenCalled()
    expect(graphs.findDefaultGraph).not.toHaveBeenCalled()
    expect(graphs.transactDefaultGraph).not.toHaveBeenCalled()
  })

  it.each([
    ['the graph is missing', null],
    ['the terminal block is missing', createGraphSnapshot({ blocks: [] })],
    [
      'the graph identity does not match the owner',
      createGraphSnapshot({ projectId: 'other-project' })
    ]
  ])('falls back to the block id when %s', async (_scenario, graph) => {
    const resolver = createManagedServiceOwnerResolver(
      createProjectRepository(createProjectSnapshot()),
      createBlockGraphRepository(graph)
    )

    await expect(resolver(owner)).resolves.toMatchObject({
      terminalName: owner.blockId
    })
  })

  it.each([
    ['the project is missing', null],
    ['the project id does not match', createProjectSnapshot({ id: 'other-project' })]
  ])('returns null without reading the graph when %s', async (_scenario, project) => {
    const graphs = createBlockGraphRepository(createGraphSnapshot())
    const resolver = createManagedServiceOwnerResolver(createProjectRepository(project), graphs)

    await expect(resolver(owner)).resolves.toBeNull()
    expect(graphs.findDefaultGraphSnapshot).not.toHaveBeenCalled()
  })
})

function createProjectSnapshot(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    id: owner.projectId,
    name: 'CleanCode',
    directory: owner.projectDirectory,
    workspaces: [],
    ...overrides
  }
}

function createGraphSnapshot(overrides: Partial<BlockGraphSnapshot> = {}): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: owner.projectId,
    workspaceName: owner.workspaceName,
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: [
      {
        id: owner.blockId,
        type: 'terminal',
        name: 'Development server',
        description: '',
        launchCommand: '',
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 }
      }
    ],
    connections: [],
    terminalGroups: [],
    ...overrides
  }
}

function createProjectRepository(project: ProjectSnapshot | null): ProjectRepository {
  return {
    findByDirectory: vi.fn(async () => project),
    save: vi.fn(async () => undefined)
  }
}

function createBlockGraphRepository(graph: BlockGraphSnapshot | null): BlockGraphRepository {
  return {
    findDefaultGraphSnapshot: vi.fn(async () => graph),
    initializeDefaultGraph: vi.fn(),
    findDefaultGraph: vi.fn(),
    transactDefaultGraph: vi.fn()
  }
}
