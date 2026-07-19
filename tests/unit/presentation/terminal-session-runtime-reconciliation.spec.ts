import {
  applyTerminalExitEvent,
  applyTerminalSessionSnapshot,
  reconcileTerminalSessionSnapshots
} from '../../../src/presentation/app-shell/terminalSessionRuntime'
import type { TerminalViewState } from '../../../src/presentation/app-shell/types'

describe('terminal session runtime reconciliation', () => {
  it('records an exit by full scope even when the start response has not bound the session yet', () => {
    const session = sessionSnapshot('session-1', 'running')

    const states = applyTerminalExitEvent(
      {},
      {
        scope: session,
        sessionId: session.id,
        exitCode: 0
      }
    )

    expect(states['project-1\0main\0block-1']).toMatchObject({
      sessionId: session.id,
      status: 'exited',
      runIdentity: identity(session)
    })
  })

  it('does not let a late running start response downgrade the same exited run', () => {
    const session = sessionSnapshot('session-1', 'running')
    const exited = applyTerminalExitEvent(
      {},
      {
        scope: session,
        sessionId: session.id,
        exitCode: 0
      }
    )

    const states = applyTerminalSessionSnapshot(
      exited,
      'project-1\0main\0block-1',
      session,
      'complete startup output',
      endpoint()
    )

    expect(states['project-1\0main\0block-1']).toMatchObject({
      sessionId: session.id,
      status: 'exited',
      output: 'complete startup output',
      actualEndpoint: null,
      servicePortState: null
    })
  })

  it('marks a missing requested run exited and ignores a response for a replaced identity', () => {
    const requested = sessionSnapshot('session-old', 'running')
    const replacement = sessionSnapshot('session-new', 'running', 2)
    const states: Record<string, TerminalViewState> = {
      'project-1\0main\0block-1': viewState(replacement)
    }

    expect(reconcileTerminalSessionSnapshots(states, [identity(requested)], [])).toBe(states)

    const staleStates: Record<string, TerminalViewState> = {
      'project-1\0main\0block-1': viewState(requested)
    }
    expect(
      reconcileTerminalSessionSnapshots(staleStates, [identity(requested)], [])[
        'project-1\0main\0block-1'
      ]?.status
    ).toBe('exited')
  })
})

function sessionSnapshot(sessionId: string, status: 'running' | 'exited', generation = 1) {
  return {
    id: sessionId,
    sessionId,
    runId: `run-${generation}`,
    generation,
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceName: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    terminalBlockId: 'block-1',
    workingDirectory: '/work/app',
    processId: status === 'running' ? 101 : null,
    status,
    inputHistory: [],
    exitCode: status === 'exited' ? 0 : null,
    failureReason: null
  }
}

function identity(session: ReturnType<typeof sessionSnapshot>) {
  return {
    projectId: session.projectId,
    workspaceName: session.workspaceName,
    blockId: session.blockId,
    sessionId: session.sessionId,
    runId: session.runId,
    generation: session.generation
  }
}

function viewState(session: ReturnType<typeof sessionSnapshot>): TerminalViewState {
  return {
    sessionId: session.id,
    status: session.status,
    output: '',
    runIdentity: identity(session),
    actualEndpoint: null,
    portConflict: null
  }
}

function endpoint() {
  return {
    protocol: 'http' as const,
    host: '127.0.0.1' as const,
    port: 3000,
    requestedPort: 3000,
    fallback: false,
    displayAddress: 'http://127.0.0.1:3000',
    openable: true
  }
}
