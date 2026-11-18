import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Project } from '../../../src/contexts/project/domain/aggregates/Project'
import { BlockGraph } from '../../../src/contexts/block-graph/domain/aggregates/BlockGraph'
import { FileSystemProjectRepository } from '../../../src/contexts/project/infrastructure/filesystem/FileSystemProjectRepository'
import { FileSystemBlockGraphRepository } from '../../../src/contexts/block-graph/infrastructure/filesystem/FileSystemBlockGraphRepository'
import { FindProjectByDirectoryUseCase } from '../../../src/contexts/project/application/use-cases/FindProjectByDirectoryUseCase'
import { FindDefaultGraphSnapshotUseCase } from '../../../src/contexts/block-graph/application/use-cases/FindDefaultGraphSnapshotUseCase'
import { createManagedServiceOwnerResolver } from '../../../src/platform/electron-main/managedServiceOwnerResolver'

describe('managed service owner queries', () => {
  let state: string
  beforeEach(async () => {
    state = await mkdtemp(join(tmpdir(), 'cleancode-owner-query-'))
  })
  afterEach(async () => {
    await rm(state, { recursive: true, force: true })
  })

  it('leaves missing Project and BlockGraph stores uninitialized', async () => {
    const projects = new FindProjectByDirectoryUseCase(new FileSystemProjectRepository(state))
    const graphs = new FindDefaultGraphSnapshotUseCase(new FileSystemBlockGraphRepository(state))
    await expect(projects.execute({ directory: join(state, 'project') })).resolves.toBeNull()
    await expect(
      graphs.execute({ projectDirectory: join(state, 'project'), workspaceId: 'workspace' })
    ).resolves.toBeNull()
    expect(await readdir(state)).toEqual([])
  })

  it('reads existing owner labels through public queries without initializing a missing graph', async () => {
    const project = Project.create({
      id: 'project',
      defaultWorkspaceId: 'workspace',
      name: 'Project',
      directory: join(state, 'project')
    })
    const repository = new FileSystemProjectRepository(state)
    await repository.save(project)
    const files = await readdir(state, { recursive: true })
    const graphs = new FileSystemBlockGraphRepository(state)
    const initialize = vi.spyOn(graphs, 'initializeDefaultGraph')
    const resolver = createManagedServiceOwnerResolver(
      new FindProjectByDirectoryUseCase(repository),
      new FindDefaultGraphSnapshotUseCase(graphs)
    )
    await expect(
      resolver({
        projectId: 'project',
        projectDirectory: project.directory,
        workspaceId: 'workspace',
        blockId: 'terminal',
        sessionId: 'session',
        runId: 'run',
        generation: 1
      })
    ).resolves.toMatchObject({
      projectName: 'Project',
      workspaceDisplayName: 'main',
      terminalName: 'terminal'
    })
    expect(initialize).not.toHaveBeenCalled()
    expect(await readdir(state, { recursive: true })).toEqual(files)
    await graphs.initializeDefaultGraph(
      project.directory,
      BlockGraph.createDefault({ projectId: 'project', workspaceId: 'workspace' })
    )
    await expect(
      new FindDefaultGraphSnapshotUseCase(graphs).execute({
        projectDirectory: project.directory,
        workspaceId: 'workspace'
      })
    ).resolves.toMatchObject({ projectId: 'project', workspaceId: 'workspace' })
  })
})
