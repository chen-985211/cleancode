import { TerminalSession } from '../../../../src/contexts/run/domain/aggregates/TerminalSession'

describe('terminal session', () => {
  it('starts for a terminal block inside a branch workspace', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo'
    })

    session.markRunning({ processId: 1234 })

    expect(session.status).toBe('running')
    expect(session.terminalBlockId).toBe('block-1')
    expect(session.workspaceName).toBe('main')
    expect(session.workingDirectory).toBe('/tmp/cleancode-demo')
  })

  it('accepts input only while running', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo'
    })

    expect(() => session.recordInput('pnpm test\n')).toThrow('Terminal session is not running.')

    session.markRunning({ processId: 1234 })
    session.recordInput('pnpm test\n')
    session.markExited({ exitCode: 0 })

    expect(session.status).toBe('exited')
    expect(session.inputHistory).toEqual(['pnpm test\n'])
  })

  it('blocks input while an asynchronous stop is in progress', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo'
    })
    session.markRunning({ processId: 1234 })

    session.markStopping()

    expect(session.status).toBe('stopping')
    expect(() => session.recordInput('late input')).toThrow('Terminal session is not running.')
  })

  it('defaults a new interactive session to terminate on application exit', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo'
    })

    expect(session.toSnapshot()).toMatchObject({
      kind: 'interactive',
      retentionPolicy: 'terminate-on-application-exit',
      recoveryKind: 'fresh'
    })
  })

  it('allows a running direct session to opt in to cross-application retention', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo',
      kind: 'direct'
    })
    session.markRunning({ processId: 1234 })

    session.setRetentionPolicy('keep-after-application-exit')

    expect(session.toSnapshot()).toMatchObject({
      kind: 'direct',
      retentionPolicy: 'keep-after-application-exit'
    })
  })

  it('never permits workflow-owned sessions to survive application exit', () => {
    const session = TerminalSession.create({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo',
      kind: 'workflow'
    })
    session.markRunning({ processId: 1234 })

    expect(() => session.setRetentionPolicy('keep-after-application-exit')).toThrow(
      'Workflow terminal sessions cannot survive application exit.'
    )
  })

  it('never permits Agent-owned sessions to survive application exit', () => {
    const session = TerminalSession.create({
      scope: {
        ...runScope(),
        owner: { id: 'agent-1', kind: 'agent' }
      },
      workingDirectory: '/tmp/cleancode-demo'
    })
    session.markRunning({ processId: 1234 })

    expect(() => session.setRetentionPolicy('keep-after-application-exit')).toThrow(
      'Agent terminal sessions cannot survive application exit.'
    )
  })

  it('rejects a persisted live Agent terminal that claims cross-application retention', () => {
    expect(() =>
      TerminalSession.revive({
        scope: {
          ...runScope(),
          owner: { id: 'agent-1', kind: 'agent' }
        },
        workingDirectory: '/tmp/cleancode-demo',
        kind: 'interactive',
        retentionPolicy: 'keep-after-application-exit',
        recoveryKind: 'warm',
        processId: 1234
      })
    ).toThrow('Agent terminal sessions cannot survive application exit.')
  })

  it('revives an authenticated live session without changing its run identity', () => {
    const session = TerminalSession.revive({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo',
      kind: 'interactive',
      retentionPolicy: 'keep-after-application-exit',
      recoveryKind: 'warm',
      processId: 1234
    })

    expect(session.toSnapshot()).toMatchObject({
      sessionId: 'session-1',
      runId: 'run-1',
      generation: 1,
      status: 'running',
      processId: 1234,
      recoveryKind: 'warm'
    })
  })

  it('revives a cold checkpoint as read-only history instead of a live process', () => {
    const session = TerminalSession.revive({
      scope: runScope(),
      workingDirectory: '/tmp/cleancode-demo',
      kind: 'direct',
      retentionPolicy: 'keep-after-application-exit',
      recoveryKind: 'historical',
      processId: null
    })

    expect(session.toSnapshot()).toMatchObject({
      status: 'exited',
      processId: null,
      recoveryKind: 'historical'
    })
    expect(() => session.recordInput('must not reach a process')).toThrow(
      'Terminal session is not running.'
    )
  })
})

function runScope() {
  return {
    projectId: 'project-1',
    projectDirectory: '/tmp/cleancode-demo',
    workspaceName: 'main',
    workspaceDirectory: '/tmp/cleancode-demo',
    gitBranch: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}
