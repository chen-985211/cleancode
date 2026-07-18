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
