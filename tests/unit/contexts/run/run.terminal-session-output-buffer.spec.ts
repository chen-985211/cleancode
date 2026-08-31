import { appendTerminalOutput } from '../../../../src/contexts/run/presentation/view-models/terminalSessionOutputBuffer'
import type { TerminalViewState } from '../../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'

describe('terminal session output buffer', () => {
  it('preserves the state identity when output belongs to no block terminal', () => {
    const states: Record<string, TerminalViewState> = {
      shell: createTerminalState()
    }

    const nextStates = appendTerminalOutput(states, {
      data: 'agent redraw',
      scope: {
        blockId: 'agent-1',
        generation: 1,
        gitBranch: 'main',
        owner: { id: 'agent-1', kind: 'agent' },
        projectDirectory: '/work/app',
        projectId: 'project-1',
        runId: 'agent-run-1',
        sessionId: 'agent-session-1',
        workspaceDirectory: '/work/app',
        workspaceId: 'main'
      },
      sequence: 1,
      sessionId: 'agent-session-1'
    })

    expect(nextStates).toBe(states)
  })
})

function createTerminalState(): TerminalViewState {
  return {
    output: '',
    runIdentity: {
      blockId: 'shell',
      generation: 1,
      projectId: 'project-1',
      runId: 'block-run-1',
      sessionId: 'block-session-1',
      workspaceId: 'main'
    },
    sessionId: 'block-session-1',
    status: 'running'
  }
}
