import { vi } from 'vitest'

import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'

describe('run lifecycle service', () => {
  it('blocks every run start until terminal runtime reconciliation is ready', async () => {
    const lifecycle = new RunLifecycleService({ initialRuntimePhase: 'initializing' })
    const owner = runOwner('api')

    expect(lifecycle.getRuntimeAvailability()).toEqual({
      phase: 'initializing',
      epoch: 0,
      errorCode: null,
      retryable: false
    })
    await expect(lifecycle.runStart(owner, async () => 'started')).rejects.toMatchObject({
      code: 'TERMINAL_RUNTIME_NOT_READY'
    })

    lifecycle.markRuntimeReady()
    expect(lifecycle.getRuntimeAvailability()).toMatchObject({ phase: 'ready', epoch: 1 })
    await expect(lifecycle.runStart(owner, async () => 'started')).resolves.toBe('started')

    lifecycle.markRuntimeUnavailable('TERMINAL_PROVIDER_UNAVAILABLE', true)
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'TERMINAL_RUNTIME_NOT_READY'
    })
    expect(lifecycle.getRuntimeAvailability()).toEqual({
      phase: 'unavailable',
      epoch: 1,
      errorCode: 'TERMINAL_PROVIDER_UNAVAILABLE',
      retryable: true
    })
  })

  it('blocks late starts before disposing a workspace and holds the gate until release', async () => {
    const lifecycle = new RunLifecycleService()
    const owner = runOwner('api')
    let finishDispose: () => void = () => undefined
    const disposed = new Promise<void>((resolve) => {
      finishDispose = resolve
    })
    const dispose = vi.fn(async () => disposed)
    await lifecycle.runStart(owner, async () => {
      lifecycle.track(owner, dispose)
    })

    let leaseSettled = false
    const acquiring = lifecycle
      .hardDisposeWorkspace({ projectDirectory: '/project', workspaceId: 'main' })
      .then((lease) => {
        leaseSettled = true
        return lease
      })
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    expect(leaseSettled).toBe(false)
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })

    finishDispose()
    const lease = await acquiring
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })

    lease.release()
    await expect(lifecycle.runStart(owner, async () => 'started')).resolves.toBe('started')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('keeps a quarantined workspace blocked until authoritative project recovery resolves it', async () => {
    const lifecycle = new RunLifecycleService()
    const owner = runOwner('api')
    const lease = await lifecycle.hardDisposeWorkspace({
      projectDirectory: owner.projectDirectory,
      workspaceId: owner.workspaceId
    })

    lease.quarantine()

    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: owner.projectDirectory,
        workspaceId: owner.workspaceId
      })
    ).toBe(true)
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })

    lifecycle.resolveProjectQuarantines(owner.projectDirectory)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: owner.projectDirectory,
        workspaceId: owner.workspaceId
      })
    ).toBe(false)
    await expect(lifecycle.runStart(owner, async () => 'recovered')).resolves.toBe('recovered')
  })

  it('reports a quarantined project as quarantined for every workspace until recovery', async () => {
    const lifecycle = new RunLifecycleService()
    const lease = await lifecycle.hardDisposeProject('/project')

    lease.quarantine()

    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).toBe(true)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(true)

    lifecycle.resolveProjectQuarantines('/project')
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(false)
  })

  it('holds one batch gate while keeping quarantined workspace blockers independent', async () => {
    const lifecycle = new RunLifecycleService()
    const mainOwner = runOwner('api')
    const worktreeOwner = {
      ...runOwner('web'),
      workspaceId: 'feature/sidebar',
      workspaceDirectory: '/project-sidebar',
      gitBranch: 'feature/sidebar'
    }
    const mainDispose = vi.fn(async () => undefined)
    const worktreeDispose = vi.fn(async () => undefined)
    lifecycle.track(mainOwner, mainDispose)
    lifecycle.track(worktreeOwner, worktreeDispose)

    const lease = await lifecycle.hardDisposeWorkspaces({
      projectDirectory: '/project',
      workspaceIds: ['main', 'feature/sidebar']
    })

    expect(mainDispose).toHaveBeenCalledOnce()
    expect(worktreeDispose).toHaveBeenCalledOnce()
    lease.quarantine()
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).toBe(true)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(true)

    const mainRecovery = await lifecycle.hardDisposeWorkspace({
      projectDirectory: '/project',
      workspaceId: 'main'
    })
    mainRecovery.resolve()
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(true)
    await expect(lifecycle.runStart(mainOwner, async () => 'main')).resolves.toBe('main')
    await expect(lifecycle.runStart(worktreeOwner, async () => undefined)).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })

    const worktreeRecovery = await lifecycle.hardDisposeWorkspaces({
      projectDirectory: '/project',
      workspaceIds: ['feature/sidebar']
    })
    expect(worktreeRecovery.wasQuarantined).toBe(true)
    worktreeRecovery.resolve()
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(false)
    await expect(lifecycle.runStart(worktreeOwner, async () => 'worktree')).resolves.toBe(
      'worktree'
    )

    const repeatedBatch = await lifecycle.hardDisposeWorkspaces({
      projectDirectory: '/project',
      workspaceIds: ['main', 'feature/sidebar']
    })
    repeatedBatch.quarantine()
    const batchRecovery = await lifecycle.hardDisposeWorkspaces({
      projectDirectory: '/project',
      workspaceIds: ['main', 'feature/sidebar']
    })
    expect(batchRecovery.wasQuarantined).toBe(true)
    batchRecovery.resolve()
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'main'
      })
    ).toBe(false)
    expect(
      lifecycle.isWorkspaceQuarantined({
        projectDirectory: '/project',
        workspaceId: 'feature/sidebar'
      })
    ).toBe(false)
  })

  it('hard-disposes only the requested terminal when BlockGraph deletes a block', async () => {
    const lifecycle = new RunLifecycleService()
    const apiDispose = vi.fn(async () => undefined)
    const webDispose = vi.fn(async () => undefined)
    lifecycle.track(runOwner('api'), apiDispose)
    lifecycle.track(runOwner('web'), webDispose)

    const lease = await lifecycle.hardDisposeTerminal({
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      blockId: 'api'
    })

    expect(apiDispose).toHaveBeenCalledOnce()
    expect(webDispose).not.toHaveBeenCalled()
    lease.resolve()
  })

  it('closes the global start gate before application shutdown cleanup', async () => {
    const lifecycle = new RunLifecycleService()
    const dispose = vi.fn(async () => undefined)
    const owner = runOwner('api')
    lifecycle.track(owner, dispose)

    await lifecycle.hardDisposeAll()

    expect(dispose).toHaveBeenCalledOnce()
    await expect(lifecycle.runStart(owner, async () => undefined)).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })
  })

  it('waits for every application shutdown disposer before reporting a cleanup failure', async () => {
    const lifecycle = new RunLifecycleService()
    const cleanupFailure = new Error('first disposer failed')
    let finishPendingDispose: () => void = () => undefined
    const pendingDispose = new Promise<void>((resolve) => {
      finishPendingDispose = resolve
    })
    const failedDisposer = vi.fn(async () => {
      throw cleanupFailure
    })
    const pendingDisposer = vi.fn(async () => pendingDispose)
    lifecycle.track(runOwner('api'), failedDisposer)
    lifecycle.track(runOwner('web'), pendingDisposer)

    let cleanupSettled = false
    const cleanup = lifecycle.hardDisposeAll().finally(() => {
      cleanupSettled = true
    })
    void cleanup.catch(() => undefined)

    await vi.waitFor(() => {
      expect(failedDisposer).toHaveBeenCalledOnce()
      expect(pendingDisposer).toHaveBeenCalledOnce()
    })
    expect(cleanupSettled).toBe(false)

    finishPendingDispose()
    await expect(cleanup).rejects.toBe(cleanupFailure)
  })
})

function runOwner(blockId: string) {
  return {
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId
  }
}
