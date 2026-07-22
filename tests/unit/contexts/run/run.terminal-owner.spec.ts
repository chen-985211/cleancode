import {
  createTerminalRunScope,
  createTerminalRunSlotKey,
  isBlockTerminalOwner,
  resolveTerminalOwnerRef
} from '../../../../src/contexts/run/domain/value-objects/TerminalRunScope'

describe('typed terminal owner', () => {
  const base = {
    blockId: 'shared-id',
    gitBranch: null,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }

  it('keeps block and Agent terminal slots separate even when their ids match', () => {
    const block = { ...base, owner: { id: 'shared-id', kind: 'block' as const } }
    const agent = { ...base, owner: { id: 'shared-id', kind: 'agent' as const } }

    expect(createTerminalRunSlotKey(block)).not.toBe(createTerminalRunSlotKey(agent))
    expect(isBlockTerminalOwner(block)).toBe(true)
    expect(isBlockTerminalOwner(agent)).toBe(false)
  })

  it('migrates a legacy blockId-only scope to an explicit block owner', () => {
    const scope = createTerminalRunScope({
      ...base,
      generation: 1,
      runId: 'run-1',
      sessionId: 'session-1'
    })

    expect(resolveTerminalOwnerRef(scope)).toEqual({ id: 'shared-id', kind: 'block' })
    expect(scope.owner).toEqual({ id: 'shared-id', kind: 'block' })
  })
})
