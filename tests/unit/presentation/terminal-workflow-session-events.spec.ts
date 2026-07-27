import { applyTerminalWorkflowEventToStates } from '../../../src/presentation/app-shell/terminalWorkflowSessionEvents'

describe('terminal workflow session events', () => {
  it('clears output when a workflow command session starts', () => {
    const commandStates = applyTerminalWorkflowEventToStates(
      {
        '["project-alpha","main","terminal","install"]': {
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

    expect(commandStates['["project-alpha","main","terminal","install"]']).toMatchObject({
      sessionId: 'command',
      output: ''
    })
  })

  it('marks the exact workflow session ended without replacing its identity or output', () => {
    const key = '["project-alpha","main","terminal","install"]'
    const states = {
      [key]: {
        sessionId: 'command',
        status: 'running' as const,
        output: 'install complete',
        runIdentity: runIdentity('command')
      }
    }

    const projected = applyTerminalWorkflowEventToStates(states, {
      type: 'terminal-session-ended',
      blockId: 'install',
      exit: {
        scope: runScope('command'),
        sessionId: 'command',
        exitCode: 0
      }
    })

    expect(projected[key]).toMatchObject({
      sessionId: 'command',
      status: 'exited',
      output: 'install complete',
      runIdentity: runIdentity('command')
    })
  })

  it('appends workflow output to the matching session only', () => {
    const states = applyTerminalWorkflowEventToStates(
      {
        '["project-alpha","main","terminal","install"]': {
          sessionId: 'command',
          status: 'running',
          output: 'installing ',
          runIdentity: runIdentity('command')
        },
        '["project-alpha","main","terminal","build"]': {
          sessionId: 'build',
          status: 'running',
          output: '',
          runIdentity: runIdentity('build')
        }
      },
      {
        type: 'terminal-output',
        blockId: 'install',
        output: { sessionId: 'command', sequence: 1, data: 'done', scope: runScope('command') }
      }
    )

    expect(states['["project-alpha","main","terminal","install"]']?.output).toBe('installing done')
    expect(states['["project-alpha","main","terminal","build"]']?.output).toBe('')
  })

  it('ignores a stale workflow session start after a newer run owns the block', () => {
    const key = '["project-alpha","main","terminal","install"]'
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
    workspaceId: 'main',
    workspaceDirectory: '/project',
    workingDirectory: '/project',
    processId: 1,
    status: 'running' as const,
    kind: 'workflow' as const,
    retentionPolicy: 'terminate-on-application-exit' as const,
    recoveryKind: 'fresh' as const,
    terminalSourceTheme: 'dark' as const,
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function runIdentity(sessionId: string) {
  const scope = runScope(sessionId)

  return {
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
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
    workspaceId: 'main',
    workspaceDirectory: '/project',
    blockId: sessionId === 'build' ? 'build' : 'install',
    runId: `run-${sessionId}`,
    sessionId,
    generation: 1
  }
}
