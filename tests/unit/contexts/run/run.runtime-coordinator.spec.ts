import { createDeferred } from '../../../fixtures/deferred'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'
import { RunRuntimeCoordinator } from '../../../../src/contexts/run/application/use-cases/RunRuntimeCoordinator'

describe('run runtime coordinator', () => {
  it('publishes ready only after session and managed-service reconciliation complete', async () => {
    const managedRecovery = createDeferred<void>()
    const recoverSessions = vi.fn(async () => ({
      sessions: [],
      issues: [],
      managedServiceEndpoints: []
    }))
    const recoverManagedServices = vi.fn(async () => managedRecovery.promise)
    const lifecycle = new RunLifecycleService({ initialRuntimePhase: 'initializing' })
    const coordinator = new RunRuntimeCoordinator(
      lifecycle,
      recoverSessions,
      recoverManagedServices
    )

    const initialization = coordinator.initialize()
    expect(coordinator.initialize()).toBe(initialization)
    await vi.waitFor(() => expect(recoverManagedServices).toHaveBeenCalledOnce())

    expect(lifecycle.getRuntimeAvailability()).toMatchObject({ phase: 'initializing', epoch: 0 })
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'TERMINAL_RUNTIME_NOT_READY'
    })

    managedRecovery.resolve()
    await initialization

    expect(lifecycle.getRuntimeAvailability()).toEqual({
      phase: 'ready',
      epoch: 1,
      errorCode: null,
      retryable: false
    })
    expect(recoverSessions).toHaveBeenCalledOnce()
  })
})

const owner = {
  projectId: 'project-1',
  projectDirectory: '/work/app',
  workspaceId: 'main',
  workspaceDirectory: '/work/app',
  gitBranch: 'main',
  blockId: 'terminal-1'
}
