import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSystemWorkspaceInitializationRepository } from '../../../../src/contexts/project/infrastructure/filesystem/FileSystemWorkspaceInitializationRepository'
import { WorkspaceInitialization } from '../../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'

describe('workspace initialization persistence', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-initialization-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('restores automatic cleanup receipts without changing successful object identities', async () => {
    const path = join(directory, 'initialization.json')
    const repository = new FileSystemWorkspaceInitializationRepository(path)
    const operation = WorkspaceInitialization.create({
      id: 'cleaned',
      projectId: 'project',
      projectDirectory: directory,
      workspaceId: 'workspace',
      workspaceDirectory: directory,
      branchName: 'feature',
      mode: 'new-workspace',
      defaults: {
        templates: [{ templateId: 'deleted', runAfterPlacement: true }],
        agents: [{ providerId: 'provider', count: 1 }]
      }
    })
    operation.activate()
    const [template, agent] = operation.toSnapshot().items
    operation.created(agent.id, { objectIds: ['existing-agent'], executionTarget: null })
    operation.discardUnavailableTemplate(template.id, 'BLOCK_TEMPLATE_NOT_FOUND')
    await repository.save(operation.toSnapshot())
    const restored = await new FileSystemWorkspaceInitializationRepository(path).find('cleaned')
    expect(restored).toMatchObject({
      stage: 'complete',
      items: [
        {
          id: template.id,
          status: 'skipped',
          runStatus: 'disabled',
          errorCode: 'BLOCK_TEMPLATE_NOT_FOUND'
        },
        { id: agent.id, status: 'created', result: { objectIds: ['existing-agent'] } }
      ]
    })
  })

  it('persists a verified rebind before content is created and forbids later identity changes', async () => {
    const repository = new FileSystemWorkspaceInitializationRepository(
      join(directory, 'initialization.json')
    )
    const operation = WorkspaceInitialization.create({
      id: 'interrupted',
      projectId: 'project',
      projectDirectory: directory,
      workspaceId: 'reserved',
      workspaceDirectory: join(directory, 'worktree'),
      branchName: 'feature',
      mode: 'new-workspace',
      defaults: { templates: [], agents: [{ providerId: 'provider', count: 1 }] }
    })
    operation.confirmWorktreeCreated()
    await repository.save(operation.toSnapshot())
    operation.rebindDiscoveredWorkspace('discovered')
    await repository.save(operation.toSnapshot())
    expect(await repository.find('interrupted')).toMatchObject({
      workspaceId: 'discovered',
      requiresEmptyCanvas: true
    })
    operation.activate()
    await repository.save(operation.toSnapshot())
    await expect(
      repository.save({ ...operation.toSnapshot(), workspaceId: 'another' })
    ).rejects.toMatchObject({ code: 'WORKSPACE_INITIALIZATION_SCOPE_STALE' })
  })

  it('preserves concurrent project defaults and operation progress across repository instances', async () => {
    const path = join(directory, 'initialization.json')
    const repository = new FileSystemWorkspaceInitializationRepository(path)
    const operation = WorkspaceInitialization.create({
      id: 'request',
      projectId: 'project',
      projectDirectory: directory,
      workspaceId: 'workspace',
      workspaceDirectory: directory,
      branchName: null,
      mode: 'empty-canvas',
      defaults: { templates: [], agents: [{ providerId: 'provider', count: 1 }] }
    })
    await Promise.all([
      repository.saveDefaults('project', {
        templates: [],
        agents: [{ providerId: 'provider', count: 1 }]
      }),
      new FileSystemWorkspaceInitializationRepository(path).saveDefaults('other', {
        templates: [],
        agents: [{ providerId: 'other-provider', count: 1 }]
      }),
      repository.save(operation.toSnapshot())
    ])
    const reopened = new FileSystemWorkspaceInitializationRepository(path)
    expect(await reopened.getDefaults('project')).toEqual({
      templates: [],
      agents: [{ providerId: 'provider', count: 1 }]
    })
    expect(await reopened.getDefaults('other')).toEqual({
      templates: [],
      agents: [{ providerId: 'other-provider', count: 1 }]
    })
    expect(await reopened.find('request')).toEqual(operation.toSnapshot())
    operation.cancel()
    await reopened.save(operation.toSnapshot())
    const stale = { ...operation.toSnapshot(), stage: 'ready' as const }
    await expect(repository.save(stale)).rejects.toMatchObject({
      code: 'WORKSPACE_INITIALIZATION_SCOPE_STALE'
    })
    expect((await reopened.find('request'))?.stage).toBe('cancelled')
  })

  it('reads legacy defaults without rewriting and preserves existing initialization identities on upgrade', async () => {
    const path = join(directory, 'initialization.json')
    const repository = new FileSystemWorkspaceInitializationRepository(path)
    const operation = WorkspaceInitialization.create({
      id: 'legacy',
      projectId: 'project',
      projectDirectory: directory,
      workspaceId: 'workspace',
      workspaceDirectory: directory,
      branchName: null,
      mode: 'empty-canvas',
      defaults: { templates: [], agents: [{ providerId: 'codex', count: 1 }] }
    }).toSnapshot()
    const legacy = {
      ...operation,
      items: operation.items.map((item) => ({ ...item, id: 'legacy:agent' }))
    }
    const source = JSON.stringify({
      version: 1,
      defaults: [
        {
          projectId: 'project',
          value: {
            templates: [],
            providerId: 'codex'
          }
        }
      ],
      operations: [legacy]
    })
    await writeFile(path, source)
    expect(await repository.getDefaults('project')).toEqual({
      templates: [],
      agents: [{ providerId: 'codex', count: 1 }]
    })
    expect(await readFile(path, 'utf8')).toBe(source)
    await repository.saveDefaults('other', {
      templates: [],
      agents: [{ providerId: 'codex', count: 2 }]
    })
    expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(2)
    expect(await repository.find('legacy')).toEqual(legacy)
    expect(await repository.getDefaults('project')).toEqual({
      templates: [],
      agents: [{ providerId: 'codex', count: 1 }]
    })
    expect(await repository.getDefaults('other')).toEqual({
      templates: [],
      agents: [{ providerId: 'codex', count: 2 }]
    })
  })

  it('keeps corrupt or unsupported data intact instead of silently enabling defaults', async () => {
    const path = join(directory, 'initialization.json')
    const source = '{"version":900,"defaults":[],"operations":[]}'
    await writeFile(path, source)
    const repository = new FileSystemWorkspaceInitializationRepository(path)
    await expect(repository.getDefaults('project')).rejects.toMatchObject({
      code: 'WORKSPACE_INITIALIZATION_INVALID'
    })
    expect(await readFile(path, 'utf8')).toBe(source)
  })
})
