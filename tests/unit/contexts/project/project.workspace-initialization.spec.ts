import { WorkspaceInitialization } from '../../../../src/contexts/project/domain/aggregates/WorkspaceInitialization'
import { normalizeWorkspaceDefaults } from '../../../../src/contexts/project/domain/value-objects/WorkspaceDefaults'

describe('workspace initialization', () => {
  it('expands each provider quantity into distinct durable identities', () => {
    const initialization = create({
      templates: [],
      agents: [
        { providerId: 'codex', count: 2 },
        { providerId: 'claude-code', count: 1 }
      ]
    })
    const items = initialization.toSnapshot().items
    expect(items.map((item) => item.providerId)).toEqual(['codex', 'codex', 'claude-code'])
    expect(new Set(items.map((item) => item.id)).size).toBe(3)
    expect(WorkspaceInitialization.restore(initialization.toSnapshot()).toSnapshot().items).toEqual(
      items
    )
  })

  it.each([0, -1, 1.5, Infinity, NaN, 101])('rejects invalid agent quantity %s', (count) => {
    expect(() =>
      normalizeWorkspaceDefaults({ templates: [], agents: [{ providerId: 'codex', count }] })
    ).toThrow()
  })

  it('rejects duplicate providers and an excessive total', () => {
    expect(() =>
      normalizeWorkspaceDefaults({
        templates: [],
        agents: [
          { providerId: 'codex', count: 1 },
          { providerId: 'codex', count: 2 }
        ]
      })
    ).toThrow()
    expect(() =>
      normalizeWorkspaceDefaults({
        templates: [],
        agents: [
          { providerId: 'codex', count: 60 },
          { providerId: 'claude-code', count: 60 }
        ]
      })
    ).toThrow()
  })

  it('rejects corrupt execution receipts before they can reach a runtime', () => {
    const initialization = create({
      templates: [{ templateId: 'dev', runAfterPlacement: true }],
      agents: []
    })
    const snapshot = initialization.toSnapshot()
    expect(() =>
      WorkspaceInitialization.restore({
        ...snapshot,
        items: [
          {
            ...snapshot.items[0],
            status: 'created',
            result: { objectIds: ['dev'], executionTarget: { type: 'block-set', blockIds: [] } }
          }
        ]
      })
    ).toThrow()
    expect(() =>
      WorkspaceInitialization.restore({
        ...snapshot,
        items: [{ ...snapshot.items[0], kind: 'agent', providerId: 'provider' }]
      })
    ).toThrow()
  })
  it('defaults to an empty workspace and rejects duplicate or invalid selections', () => {
    expect(normalizeWorkspaceDefaults(undefined)).toEqual({ templates: [], agents: [] })
    expect(() =>
      normalizeWorkspaceDefaults({
        templates: [
          { templateId: 'a', runAfterPlacement: false },
          { templateId: 'a', runAfterPlacement: true }
        ],
        agents: []
      })
    ).toThrow()
    expect(() => normalizeWorkspaceDefaults({ templates: [], providerId: '' })).toThrow()
  })

  it('freezes the requested contents and keeps creation independent from execution', () => {
    const defaults = {
      templates: [{ templateId: 'startup', runAfterPlacement: true }],
      agents: [{ providerId: 'provider-1', count: 1 }]
    }
    const initialization = create(defaults)
    defaults.templates[0].templateId = 'different'
    const item = initialization.toSnapshot().items[0]
    expect(item.templateId).toBe('startup')
    initialization.created(item.id, {
      objectIds: ['terminal-1'],
      executionTarget: { type: 'block-set', blockIds: ['terminal-1'] }
    })
    initialization.requestRun(item.id)
    const restored = WorkspaceInitialization.restore(initialization.toSnapshot())
    restored.interrupt()
    expect(restored.toSnapshot().items[0]).toMatchObject({
      status: 'created',
      runStatus: 'uncertain'
    })
    expect(() => restored.requestRun(item.id)).toThrow()
  })

  it('retries failed items without changing committed identities and persists skips', () => {
    const initialization = create({
      templates: [{ templateId: 'startup', runAfterPlacement: false }],
      agents: [{ providerId: 'provider-1', count: 1 }]
    })
    const [template, agent] = initialization.toSnapshot().items
    initialization.created(template.id, { objectIds: ['terminal-1'], executionTarget: null })
    initialization.fail(agent.id, 'AGENT_PROVIDER_UNAVAILABLE')
    initialization.retry(agent.id)
    expect(initialization.toSnapshot().items[0]).toMatchObject({
      status: 'created',
      result: { objectIds: ['terminal-1'] }
    })
    initialization.skip(agent.id)
    expect(
      WorkspaceInitialization.restore(initialization.toSnapshot()).toSnapshot().items[1].status
    ).toBe('skipped')
    expect(() => initialization.retry(template.id)).toThrow()
  })

  it('rejects later mutation after the target workspace is invalidated', () => {
    const initialization = create({
      templates: [],
      agents: [{ providerId: 'provider-1', count: 1 }]
    })
    const item = initialization.toSnapshot().items[0]
    initialization.cancel()
    expect(() =>
      initialization.created(item.id, { objectIds: ['agent-1'], executionTarget: null })
    ).toThrow()
  })
})

function create(defaults: Parameters<typeof normalizeWorkspaceDefaults>[0]) {
  return WorkspaceInitialization.create({
    id: 'request-1',
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'workspace-1',
    workspaceDirectory: '/worktree',
    branchName: 'feature',
    defaults: normalizeWorkspaceDefaults(defaults),
    mode: 'new-workspace'
  })
}
