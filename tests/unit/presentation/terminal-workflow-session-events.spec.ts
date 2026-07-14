import { applyTerminalWorkflowEventToStates } from '../../../src/presentation/app-shell/terminalWorkflowSessionEvents'

describe('terminal workflow session events', () => {
  it('clears output for command sessions and preserves it for interactive handoff sessions', () => {
    const commandStates = applyTerminalWorkflowEventToStates(
      {
        'main\0install': { sessionId: 'old', status: 'running', output: 'old output' }
      },
      {
        type: 'terminal-session-started',
        blockId: 'install',
        clearOutput: true,
        session: session('command')
      }
    )
    const handoffStates = applyTerminalWorkflowEventToStates(commandStates, {
      type: 'terminal-session-started',
      blockId: 'install',
      clearOutput: false,
      session: session('interactive')
    })

    expect(commandStates['main\0install']).toMatchObject({ sessionId: 'command', output: '' })
    expect(handoffStates['main\0install']).toMatchObject({
      sessionId: 'interactive',
      output: ''
    })
  })

  it('appends workflow output to the matching session only', () => {
    const states = applyTerminalWorkflowEventToStates(
      {
        'main\0install': { sessionId: 'command', status: 'running', output: 'installing ' },
        'main\0build': { sessionId: 'build', status: 'running', output: '' }
      },
      {
        type: 'terminal-output',
        blockId: 'install',
        output: { sessionId: 'command', data: 'done' }
      }
    )

    expect(states['main\0install']?.output).toBe('installing done')
    expect(states['main\0build']?.output).toBe('')
  })
})

function session(id: string) {
  return {
    id,
    terminalBlockId: 'install',
    workspaceName: 'main',
    workingDirectory: '/project',
    processId: 1,
    status: 'running' as const,
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}
