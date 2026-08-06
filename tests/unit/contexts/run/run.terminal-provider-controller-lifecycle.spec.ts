import type { Socket } from 'node:net'

import { TerminalProviderControllerLifecycle } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderControllerLifecycle'
import type { TerminalProviderApplicationDetachResult } from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderProtocol'
import { createDeferred } from '../../../fixtures/deferred'

describe('terminal provider controller lifecycle', () => {
  it('releases a controller whose application process has exited before accepting its replacement', async () => {
    const firstSocket = {} as Socket
    const replacementSocket = {} as Socket
    const release = createDeferred<TerminalProviderApplicationDetachResult>()
    let isFirstControllerAlive = true
    const lifecycle = new TerminalProviderControllerLifecycle({
      createRelease: () => release.promise,
      hasLiveSessions: () => true,
      isProcessAlive: (processId) => processId !== 101 || isFirstControllerAlive,
      onClaim: vi.fn(),
      onIdleWithoutLiveSessions: vi.fn()
    })

    lifecycle.claim(firstSocket, 'controller-1', 101)
    isFirstControllerAlive = false

    expect(() => lifecycle.claim(replacementSocket, 'controller-2', 202)).toThrow(
      expect.objectContaining({ code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY' })
    )
    expect(lifecycle.state.kind).toBe('releasing')

    release.resolve({
      releaseId: 'release-1',
      outcome: 'completed',
      terminateCandidateCount: 0,
      retainedSessionCount: 1,
      stoppedSessionCount: 0,
      retiredSessionCount: 0,
      failureCount: 0
    })
    await vi.waitFor(() => expect(lifecycle.state.kind).toBe('unclaimed'))

    expect(lifecycle.claim(replacementSocket, 'controller-2', 202)).toEqual({
      controllerLeaseId: expect.any(String)
    })
  })

  it('releases a stale controller when a restarted application reuses its process id', async () => {
    const firstSocket = {} as Socket
    const replacementSocket = {} as Socket
    const release = createDeferred<TerminalProviderApplicationDetachResult>()
    const lifecycle = new TerminalProviderControllerLifecycle({
      createRelease: () => release.promise,
      hasLiveSessions: () => true,
      isProcessAlive: () => true,
      onClaim: vi.fn(),
      onIdleWithoutLiveSessions: vi.fn()
    })

    lifecycle.claim(firstSocket, 'controller-1', 101)

    expect(() => lifecycle.claim(replacementSocket, 'controller-2', 101)).toThrow(
      expect.objectContaining({ code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY' })
    )
    expect(lifecycle.state.kind).toBe('releasing')

    release.resolve({
      releaseId: 'release-1',
      outcome: 'completed',
      terminateCandidateCount: 0,
      retainedSessionCount: 1,
      stoppedSessionCount: 0,
      retiredSessionCount: 0,
      failureCount: 0
    })
    await vi.waitFor(() => expect(lifecycle.state.kind).toBe('unclaimed'))

    expect(lifecycle.claim(replacementSocket, 'controller-2', 101)).toEqual({
      controllerLeaseId: expect.any(String)
    })
  })

  it('releases a disconnected controller even while its queued request is still pending', async () => {
    const firstSocket = { destroyed: false } as Socket
    const replacementSocket = {} as Socket
    const release = createDeferred<TerminalProviderApplicationDetachResult>()
    const lifecycle = new TerminalProviderControllerLifecycle({
      createRelease: () => release.promise,
      hasLiveSessions: () => true,
      isProcessAlive: () => true,
      onClaim: vi.fn(),
      onIdleWithoutLiveSessions: vi.fn()
    })

    lifecycle.claim(firstSocket, 'controller-1', 101)
    Object.assign(firstSocket, { destroyed: true })

    expect(() => lifecycle.claim(replacementSocket, 'controller-2', 202)).toThrow(
      expect.objectContaining({ code: 'TERMINAL_PROVIDER_CONTROLLER_BUSY' })
    )
    expect(lifecycle.state.kind).toBe('releasing')

    release.resolve({
      releaseId: 'release-1',
      outcome: 'completed',
      terminateCandidateCount: 0,
      retainedSessionCount: 1,
      stoppedSessionCount: 0,
      retiredSessionCount: 0,
      failureCount: 0
    })
    await vi.waitFor(() => expect(lifecycle.state.kind).toBe('unclaimed'))

    expect(lifecycle.claim(replacementSocket, 'controller-2', 202)).toEqual({
      controllerLeaseId: expect.any(String)
    })
  })

  it('expires an unresponsive release before admitting a replacement controller', async () => {
    const firstSocket = { destroyed: false } as Socket
    const replacementSocket = {} as Socket
    const lifecycle = new TerminalProviderControllerLifecycle({
      createRelease: () => new Promise(() => undefined),
      hasLiveSessions: () => true,
      isProcessAlive: () => true,
      releaseDeadlineMs: 25,
      onClaim: vi.fn(),
      onIdleWithoutLiveSessions: vi.fn()
    })

    lifecycle.claim(firstSocket, 'controller-1', 101)
    lifecycle.handleSocketClose(firstSocket)

    await vi.waitFor(() => expect(lifecycle.state.kind).toBe('unclaimed'))
    expect(lifecycle.claim(replacementSocket, 'controller-2', 202)).toEqual({
      controllerLeaseId: expect.any(String)
    })
  })
})
