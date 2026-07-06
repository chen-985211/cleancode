import { TerminalSession } from '../../../../src/contexts/run/domain/aggregates/TerminalSession'

describe('terminal session', () => {
  it('starts for a terminal block inside a branch workspace', () => {
    const session = TerminalSession.create({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
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
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/tmp/cleancode-demo'
    })

    expect(() => session.recordInput('pnpm test\n')).toThrow('Terminal session is not running.')

    session.markRunning({ processId: 1234 })
    session.recordInput('pnpm test\n')
    session.markExited({ exitCode: 0 })

    expect(session.status).toBe('exited')
    expect(session.inputHistory).toEqual(['pnpm test\n'])
  })
})
