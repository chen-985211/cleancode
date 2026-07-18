import { applyTerminalWorkflowEventToStates } from '../../../src/presentation/app-shell/terminalWorkflowSessionEvents'

describe('terminal workflow session events', () => {
  it('clears output for command sessions and preserves it for interactive handoff sessions', () => {
    const commandStates = applyTerminalWorkflowEventToStates(
      {
        'project-alpha\0main\0install': {
          sessionId: 'old',
          status: 'running',
          output: 'old output'
        }
      },
      {
        type: 'terminal-session-started',
        blockId: 'install',
        clearOutput: true,
        endpoint: null,
        session: session('command')
      }
    )
    const handoffStates = applyTerminalWorkflowEventToStates(commandStates, {
      type: 'terminal-session-started',
      blockId: 'install',
      clearOutput: false,
      endpoint: null,
      session: session('interactive', 2)
    })

    expect(commandStates['project-alpha\0main\0install']).toMatchObject({
      sessionId: 'command',
      output: ''
    })
    expect(handoffStates['project-alpha\0main\0install']).toMatchObject({
      sessionId: 'interactive',
      output: ''
    })
  })

  it('appends workflow output to the matching session only', () => {
    const states = applyTerminalWorkflowEventToStates(
      {
        'project-alpha\0main\0install': {
          sessionId: 'command',
          status: 'running',
          output: 'installing ',
          runIdentity: runIdentity('command')
        },
        'project-alpha\0main\0build': {
          sessionId: 'build',
          status: 'running',
          output: '',
          runIdentity: runIdentity('build')
        }
      },
      {
        type: 'terminal-output',
        blockId: 'install',
        output: { sessionId: 'command', data: 'done', scope: runScope('command') }
      }
    )

    expect(states['project-alpha\0main\0install']?.output).toBe('installing done')
    expect(states['project-alpha\0main\0build']?.output).toBe('')
  })

  it('ignores a stale workflow session start after a newer run owns the block', () => {
    const key = 'project-alpha\0main\0install'
    const current = {
      [key]: {
        sessionId: 'new-session',
        status: 'running' as const,
        output: 'new output',
        runIdentity: {
          ...runIdentity('new-session'),
          generation: 2
        },
        actualEndpoint: {
          protocol: 'http' as const,
          host: '127.0.0.1' as const,
          port: 4_317,
          requestedPort: 3_000,
          fallback: true,
          displayAddress: 'http://127.0.0.1:4317',
          openable: true
        },
        portConflict: null
      }
    }

    const projected = applyTerminalWorkflowEventToStates(current, {
      type: 'terminal-session-started',
      blockId: 'install',
      clearOutput: true,
      endpoint: null,
      session: session('stale-session')
    })

    expect(projected).toBe(current)
  })
})

function session(id: string, generation = 1) {
  return {
    id,
    blockId: 'install',
    generation,
    runId: `run-${id}`,
    sessionId: id,
    terminalBlockId: 'install',
    projectId: 'project-alpha',
    projectDirectory: '/project',
    gitBranch: null,
    workspaceName: 'main',
    workspaceDirectory: '/project',
    workingDirectory: '/project',
    processId: 1,
    status: 'running' as const,
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function runIdentity(sessionId: string) {
  const scope = runScope(sessionId)

  return {
    projectId: scope.projectId,
    workspaceName: scope.workspaceName,
    blockId: scope.blockId,
    runId: scope.runId,
    sessionId: scope.sessionId,
    generation: scope.generation
  }
}

function runScope(sessionId: string) {
  return {
    projectId: 'project-alpha',
    projectDirectory: '/project',
    gitBranch: null,
    workspaceName: 'main',
    workspaceDirectory: '/project',
    blockId: sessionId === 'build' ? 'build' : 'install',
    runId: `run-${sessionId}`,
    sessionId,
    generation: 1
  }
}
