import { projectTerminalPortConflict } from '../../../src/platform/electron-main/terminalPortConflictProjection'

describe('terminal port conflict projection', () => {
  it('preserves managed ownership when display-name resolution fails', async () => {
    const resolutionError = new Error('project read failed')
    const onResolutionError = vi.fn()

    await expect(
      projectTerminalPortConflict(
        {
          code: 'SERVICE_PORT_FIXED_CONFLICT',
          details: {
            ...attemptedDetails,
            port: 3_000,
            managedProjectId: 'project-owner',
            managedProjectDirectory: '/repo/owner',
            managedWorkspaceName: 'feature/api',
            managedBlockId: 'api',
            managedSessionId: 'owner-session',
            managedRunId: 'owner-run',
            managedGeneration: 3,
            managedLeaseState: 'releasing'
          }
        },
        async () => {
          throw resolutionError
        },
        onResolutionError
      )
    ).resolves.toMatchObject({
      type: 'service-port-conflict',
      scope: attemptedIdentity,
      conflict: {
        port: 3_000,
        ownership: 'managed',
        managedOwner: null,
        managedLeaseState: 'releasing'
      }
    })
    expect(onResolutionError).toHaveBeenCalledWith(resolutionError)
  })

  it.each([
    ['SERVICE_PORT_FIXED_CONFLICT', 'external'],
    ['SERVICE_LISTENER_OWNERSHIP_MISMATCH', 'external'],
    ['SERVICE_LISTENER_OWNERSHIP_UNVERIFIED', 'unknown'],
    ['SERVICE_PORT_ALLOCATION_EXHAUSTED', 'unknown']
  ] as const)('classifies %s as %s ownership', async (code, ownership) => {
    await expect(
      projectTerminalPortConflict(
        { code, details: { ...attemptedDetails, port: 4_001 } },
        undefined
      )
    ).resolves.toMatchObject({ conflict: { code, ownership, port: 4_001 } })
  })

  it('does not publish a conflict without an exact attempted Run identity', async () => {
    await expect(
      projectTerminalPortConflict(
        { code: 'SERVICE_PORT_FIXED_CONFLICT', details: { port: 3_000 } },
        undefined
      )
    ).resolves.toBeNull()
  })
})

const attemptedIdentity = {
  projectId: 'project-attempt',
  workspaceName: 'main',
  blockId: 'web',
  sessionId: 'attempt-session',
  runId: 'attempt-run',
  generation: 2
}

const attemptedDetails = {
  attemptedProjectId: attemptedIdentity.projectId,
  attemptedProjectDirectory: '/repo/attempt',
  attemptedWorkspaceName: attemptedIdentity.workspaceName,
  attemptedWorkspaceDirectory: '/repo/attempt',
  attemptedGitBranch: 'main',
  attemptedBlockId: attemptedIdentity.blockId,
  attemptedSessionId: attemptedIdentity.sessionId,
  attemptedRunId: attemptedIdentity.runId,
  attemptedGeneration: attemptedIdentity.generation
}
