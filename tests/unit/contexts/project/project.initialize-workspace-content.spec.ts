import { InitializeWorkspaceContentUseCase } from '../../../../src/contexts/project/application/use-cases/InitializeWorkspaceContentUseCase'
import { WorkspaceInitialization } from '../../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import type { WorkspaceInitializationSnapshot } from '../../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import type { WorkspaceInitializationRepository } from '../../../../src/contexts/project/application/ports/WorkspaceInitializationRepository'
import type { WorkspaceInitializationContentPort } from '../../../../src/contexts/project/application/ports/WorkspaceInitializationContentPort'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('initialize workspace contents', () => {
  it('prepares a previously missing template before requesting fresh placement geometry', async () => {
    const fixture = setup()
    const operation = WorkspaceInitialization.restore({
      ...fixture.getSnapshot(),
      items: fixture.getSnapshot().items.map((item) => ({ ...item, prepared: false }))
    })
    const item = operation.toSnapshot().items[0]
    operation.fail(item.id, 'BLOCK_TEMPLATE_NOT_FOUND')
    operation.place(item.id, { x: 0, y: 0 })
    await fixture.repository.save(operation.toSnapshot())
    const prepared = await fixture.useCase.execute({ ...fixture.command, retryItemId: item.id })
    expect(prepared.items[0]).toMatchObject({ prepared: true, status: 'pending', position: null })
    expect(fixture.content.createTemplate).not.toHaveBeenCalled()
    await fixture.useCase.execute(fixture.command)
    expect(fixture.content.createTemplate).toHaveBeenCalledOnce()
  })
  it('rechecks an empty canvas when applying and leaves unrelated objects untouched', async () => {
    const fixture = setup()
    await fixture.repository.save({ ...fixture.getSnapshot(), mode: 'empty-canvas' })
    fixture.content.isEmpty.mockResolvedValue(false)
    await expect(fixture.useCase.execute(fixture.command)).rejects.toMatchObject({
      code: 'WORKSPACE_INITIALIZATION_CANVAS_NOT_EMPTY'
    })
    expect(fixture.content.createTemplate).not.toHaveBeenCalled()
    expect(fixture.content.createAgent).not.toHaveBeenCalled()
  })

  it('continues an admitted partial application after the canvas acquires content', async () => {
    const fixture = setup()
    await fixture.repository.save({ ...fixture.getSnapshot(), mode: 'empty-canvas' })
    fixture.content.createAgent.mockRejectedValueOnce(new Error('Provider unavailable'))
    const first = await fixture.useCase.execute(fixture.command)
    fixture.content.isEmpty.mockResolvedValue(false)
    await fixture.useCase.execute({ ...fixture.command, retryItemId: first.items[1].id })
    expect(fixture.content.isEmpty).toHaveBeenCalledOnce()
    expect(fixture.content.createTemplate).toHaveBeenCalledOnce()
  })
  it('serializes duplicate requests and runs only the newly committed template scope', async () => {
    const fixture = setup()
    const [first, second] = await Promise.all([
      fixture.useCase.execute(fixture.command),
      fixture.useCase.execute(fixture.command)
    ])
    expect(first).toEqual(second)
    expect(fixture.content.createTemplate).toHaveBeenCalledOnce()
    expect(fixture.content.createAgent).toHaveBeenCalledOnce()
    expect(fixture.content.run).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'workspace' }),
      { objectIds: ['terminal'], executionTarget: { type: 'block-set', blockIds: ['terminal'] } }
    )
    expect(first.stage).toBe('complete')
  })

  it('retains successful content when the Agent fails and retries only the failed item', async () => {
    const fixture = setup()
    fixture.content.createAgent.mockRejectedValueOnce(
      createExpectedAppError('AGENT_PROVIDER_UNAVAILABLE', 'Unavailable.')
    )
    const first = await fixture.useCase.execute(fixture.command)
    expect(first.items.map((item) => item.status)).toEqual(['created', 'failed'])
    await fixture.useCase.execute({ ...fixture.command, retryItemId: first.items[1].id })
    expect(fixture.content.createTemplate).toHaveBeenCalledOnce()
    expect(fixture.content.run).toHaveBeenCalledOnce()
    expect(fixture.content.createAgent).toHaveBeenCalledTimes(2)
  })

  it('does not replay a startup request whose response was lost across a restart', async () => {
    const fixture = setup()
    const operation = WorkspaceInitialization.restore(fixture.getSnapshot())
    operation.created(operation.toSnapshot().items[0].id, {
      objectIds: ['terminal'],
      executionTarget: { type: 'block-set', blockIds: ['terminal'] }
    })
    operation.requestRun(operation.toSnapshot().items[0].id)
    await fixture.repository.save(operation.toSnapshot())
    const inspected = await fixture.useCase.inspect(fixture.command.initializationId)
    expect(inspected?.items[0].runStatus).toBe('uncertain')
    await fixture.useCase.execute(fixture.command)
    expect(fixture.content.run).not.toHaveBeenCalled()
    expect(fixture.content.createTemplate).not.toHaveBeenCalled()
  })

  it('stops creating when the target is invalidated and rejects another workspace identity', async () => {
    const fixture = setup()
    await expect(
      fixture.useCase.execute({ ...fixture.command, workspaceId: 'different' })
    ).rejects.toMatchObject({ code: 'WORKSPACE_INITIALIZATION_SCOPE_STALE' })
    fixture.validate.mockResolvedValue(false)
    await expect(fixture.useCase.execute(fixture.command)).rejects.toMatchObject({
      code: 'WORKSPACE_INITIALIZATION_SCOPE_STALE'
    })
    expect(fixture.content.createTemplate).not.toHaveBeenCalled()
  })
})

function setup() {
  const operation = WorkspaceInitialization.create({
    id: 'initialization',
    projectId: 'project',
    projectDirectory: '/project',
    workspaceId: 'workspace',
    workspaceDirectory: '/worktree',
    branchName: 'feature',
    mode: 'new-workspace',
    defaults: {
      templates: [{ templateId: 'startup', runAfterPlacement: true }],
      agents: [{ providerId: 'provider', count: 1 }]
    }
  })
  operation.prepare(operation.toSnapshot().items[0].id, 'Startup')
  operation.activate()
  let snapshot: WorkspaceInitializationSnapshot = operation.toSnapshot()
  const repository: WorkspaceInitializationRepository = {
    getDefaults: async () => ({ templates: [], agents: [] }),
    saveDefaults: async () => {},
    find: async () => structuredClone(snapshot),
    list: async () => [structuredClone(snapshot)],
    save: async (value) => {
      snapshot = structuredClone(value)
    }
  }
  const content = {
    isEmpty: vi.fn(async () => true),
    prepareTemplate: vi.fn(async () => 'Startup'),
    createTemplate: vi.fn<WorkspaceInitializationContentPort['createTemplate']>(async () => ({
      objectIds: ['terminal'],
      executionTarget: { type: 'block-set', blockIds: ['terminal'] }
    })),
    createAgent: vi.fn<WorkspaceInitializationContentPort['createAgent']>(async () => ({
      objectIds: ['agent'],
      executionTarget: null
    })),
    run: vi.fn(async () => 'run-1')
  }
  const validate = vi.fn(async () => true)
  return {
    repository,
    content,
    validate,
    getSnapshot: () => structuredClone(snapshot),
    useCase: new InitializeWorkspaceContentUseCase(repository, content, validate),
    command: {
      initializationId: 'initialization',
      projectId: 'project',
      workspaceId: 'workspace',
      positions: operation
        .toSnapshot()
        .items.map((item, i) => ({ itemId: item.id, x: i * 1000, y: 0 }))
    }
  }
}
