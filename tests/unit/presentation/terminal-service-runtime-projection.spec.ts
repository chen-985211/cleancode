import {
  applyTerminalServiceRunEvent,
  type TerminalServiceRunEvent
} from '../../../src/presentation/app-shell/terminalServiceRunProjection'
import { createTerminalStateKey } from '../../../src/presentation/app-shell/terminalSessionWorkspaceMigration'
import type { TerminalViewState } from '../../../src/presentation/app-shell/types'

describe('terminal service run projection', () => {
  it('projects runtime state into an exact project, workspace, and block scope', () => {
    const alphaKey = createTerminalStateKey('project-alpha', 'main', 'api')
    const betaKey = createTerminalStateKey('project-beta', 'main', 'api')
    const states = {
      [alphaKey]: createState('alpha-session'),
      [betaKey]: createState('beta-session')
    }

    const projected = applyTerminalServiceRunEvent(states, startedEvent(2))

    expect(projected[alphaKey]).toMatchObject({
      runIdentity: expect.objectContaining({ runId: 'run-2', generation: 2 })
    })
    expect(projected[betaKey]).toBe(states[betaKey])
  })

  it('marks a service as running as soon as its process starts waiting for readiness', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const projected = applyTerminalServiceRunEvent(
      { [key]: { ...createState('old-session'), status: 'exited' } },
      startedEvent(2)
    )

    expect(projected[key]).toMatchObject({
      sessionId: 'session-2',
      status: 'running',
      actualEndpoint: null
    })
  })

  it('ignores an endpoint event from an older run generation', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const current = applyTerminalServiceRunEvent(
      { [key]: createState('session-2') },
      startedEvent(2)
    )
    const staleEndpoint: TerminalServiceRunEvent = {
      type: 'service-endpoint-updated',
      scope: { ...startedEvent(1).scope, runId: 'run-1', sessionId: 'session-1' },
      endpoint: {
        protocol: 'http',
        host: '127.0.0.1',
        port: 3000,
        requestedPort: 3000,
        fallback: false,
        displayAddress: 'http://127.0.0.1:3000',
        openable: true
      }
    }

    expect(applyTerminalServiceRunEvent(current, staleEndpoint)).toBe(current)
    expect(current[key]?.actualEndpoint).toBeNull()
  })

  it('does not let a different run reuse the current generation identity', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const current = applyTerminalServiceRunEvent(
      { [key]: createState('session-2') },
      startedEvent(2)
    )
    const colliding = {
      ...startedEvent(2),
      scope: {
        ...startedEvent(2).scope,
        runId: 'different-run',
        sessionId: 'different-session'
      }
    }

    expect(applyTerminalServiceRunEvent(current, colliding)).toBe(current)
  })

  it('projects a newer conflict even when process startup never emitted started', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const current = applyTerminalServiceRunEvent(
      { [key]: createState('session-1') },
      startedEvent(1)
    )
    const conflict: TerminalServiceRunEvent = {
      type: 'service-port-conflict',
      scope: startedEvent(2).scope,
      conflict: {
        code: 'SERVICE_PORT_FIXED_CONFLICT',
        port: 3000,
        ownership: 'external',
        managedOwner: null,
        managedLeaseState: null
      }
    }

    const projected = applyTerminalServiceRunEvent(current, conflict)

    expect(projected[key]).toMatchObject({
      sessionId: 'session-2',
      runIdentity: expect.objectContaining({ runId: 'run-2', generation: 2 }),
      actualEndpoint: null,
      portConflict: expect.objectContaining({ port: 3000 })
    })
    expect(
      applyTerminalServiceRunEvent(projected, { ...conflict, scope: startedEvent(1).scope })
    ).toBe(projected)
  })

  it('clears endpoint and conflict only when the current run ends', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const started = applyTerminalServiceRunEvent(
      { [key]: createState('session-2') },
      startedEvent(2)
    )
    const ready = applyTerminalServiceRunEvent(started, {
      type: 'service-endpoint-updated',
      scope: startedEvent(2).scope,
      endpoint: {
        protocol: 'https',
        host: '127.0.0.1',
        port: 4443,
        requestedPort: null,
        fallback: false,
        displayAddress: 'https://127.0.0.1:4443',
        openable: true
      }
    })
    const staleEnded = applyTerminalServiceRunEvent(ready, {
      type: 'service-run-ended',
      scope: startedEvent(1).scope
    })
    const ended = applyTerminalServiceRunEvent(ready, {
      type: 'service-run-ended',
      scope: startedEvent(2).scope
    })

    expect(staleEnded).toBe(ready)
    expect(ended[key]).toMatchObject({
      runIdentity: expect.objectContaining({ runId: 'run-2', generation: 2 }),
      actualEndpoint: null,
      portConflict: null
    })
    expect(applyTerminalServiceRunEvent(ended, startedEvent(1))).toBe(ended)
  })

  it('keeps the endpoint visible but non-active while releasing and clears it only after release', () => {
    const key = createTerminalStateKey('project-alpha', 'main', 'api')
    const endpoint = {
      protocol: 'http' as const,
      host: '127.0.0.1' as const,
      port: 3000,
      requestedPort: 3000,
      fallback: false,
      displayAddress: 'http://127.0.0.1:3000',
      openable: true
    }
    const running = applyTerminalServiceRunEvent(
      applyTerminalServiceRunEvent({ [key]: createState('session-2') }, startedEvent(2)),
      { type: 'service-endpoint-updated', scope: startedEvent(2).scope, endpoint }
    )
    const releasing = applyTerminalServiceRunEvent(running, {
      type: 'service-port-state-changed',
      scope: startedEvent(2).scope,
      state: 'releasing'
    })
    const released = applyTerminalServiceRunEvent(releasing, {
      type: 'service-port-state-changed',
      scope: startedEvent(2).scope,
      state: 'released'
    })

    expect(releasing[key]).toMatchObject({
      actualEndpoint: endpoint,
      servicePortState: 'releasing'
    })
    expect(released[key]).toMatchObject({ actualEndpoint: null, servicePortState: null })
  })
})

function createState(sessionId: string): TerminalViewState {
  return { sessionId, status: 'running', output: '' }
}

function startedEvent(
  generation: number
): Extract<TerminalServiceRunEvent, { type: 'service-run-started' }> {
  return {
    type: 'service-run-started',
    scope: {
      projectId: 'project-alpha',
      workspaceName: 'main',
      blockId: 'api',
      runId: `run-${generation}`,
      sessionId: `session-${generation}`,
      generation
    }
  }
}
