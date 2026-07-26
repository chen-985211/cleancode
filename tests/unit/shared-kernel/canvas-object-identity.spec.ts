import {
  createCanvasObjectIdentityKey,
  type CanvasObjectIdentity
} from '../../../src/shared-kernel/domain/value-objects/CanvasObjectIdentity'

describe('canvas object identity', () => {
  it('keys every canvas object by project, physical workspace, kind, and local id', () => {
    const terminal: CanvasObjectIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      objectKind: 'terminal',
      objectId: 'node-1'
    }
    const agent: CanvasObjectIdentity = {
      ...terminal,
      objectKind: 'agent'
    }

    expect(createCanvasObjectIdentityKey(terminal)).toBe(
      JSON.stringify(['project-1', 'workspace-1', 'terminal', 'node-1'])
    )
    expect(createCanvasObjectIdentityKey(agent)).not.toBe(createCanvasObjectIdentityKey(terminal))
  })
})
