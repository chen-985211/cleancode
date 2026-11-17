import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { ProjectSnapshot } from '../../../src/contexts/project/application/dto/ProjectSnapshot'
import {
  createManagedServiceOwnerResolver,
  type ManagedServiceOwnerReference
} from '../../../src/platform/electron-main/managedServiceOwnerResolver'

const owner: ManagedServiceOwnerReference = {
  projectId: 'project-1',
  projectDirectory: '/repo/cleancode',
  workspaceId: 'feature/ports',
  blockId: 'terminal-dev',
  sessionId: 'session-1',
  runId: 'run-1',
  generation: 3
}

describe('Managed service owner resolver', () => {
  it('resolves user-facing labels from read-only Project and BlockGraph snapshots', async () => {
    const projects = createProjectQuery(createProjectSnapshot())
    const graphs = createGraphQuery(createGraphSnapshot())

    await expect(createManagedServiceOwnerResolver(projects, graphs)(owner)).resolves.toEqual({
      identity: {
        projectId: owner.projectId,
        workspaceId: owner.workspaceId,
        blockId: owner.blockId,
        sessionId: owner.sessionId,
        runId: owner.runId,
        generation: owner.generation
      },
      projectName: 'CleanCode',
      workspaceId: owner.workspaceId,
      workspaceDisplayName: 'feature/ports',
      terminalName: 'Development server'
    })

    expect(projects.execute).toHaveBeenCalledWith({ directory: owner.projectDirectory })
    expect(graphs.execute).toHaveBeenCalledWith({
      projectDirectory: owner.projectDirectory,
      workspaceId: owner.workspaceId
    })
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
      createProjectQuery(createProjectSnapshot()),
      createGraphQuery(graph)
    )

    await expect(resolver(owner)).resolves.toMatchObject({
      terminalName: owner.blockId
    })
  })

  it.each([
    ['the project is missing', null],
    ['the project id does not match', createProjectSnapshot({ id: 'other-project' })]
  ])('returns null without reading the graph when %s', async (_scenario, project) => {
    const graphs = createGraphQuery(createGraphSnapshot())
    const resolver = createManagedServiceOwnerResolver(createProjectQuery(project), graphs)

    await expect(resolver(owner)).resolves.toBeNull()
    expect(graphs.execute).not.toHaveBeenCalled()
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
    workspaceId: owner.workspaceId,
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

function createProjectQuery(project: ProjectSnapshot | null) {
  return { execute: vi.fn(async () => project) }
}

function createGraphQuery(graph: BlockGraphSnapshot | null) {
  return { execute: vi.fn(async () => graph) }
}
