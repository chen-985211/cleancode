import {
  reconcileTerminalStates,
  removeWorkspaceTerminalStates
} from '../../../src/presentation/app-shell/terminalSessionStateRetention'
import { createTerminalStateKey } from '../../../src/presentation/app-shell/terminalSessionWorkspaceMigration'
import type { TerminalViewState } from '../../../src/presentation/app-shell/types'

describe('terminal session state retention', () => {
  it('removes only the terminal surfaces owned by the selected workspace', () => {
    const main = createState('main', 'terminal-main', 1)
    const feature = createState('feature/sidebar', 'terminal-feature', 1)
    const otherProject = createState('main', 'terminal-other', 1, 'project-beta')
    const states = {
      [createTerminalStateKey('project-alpha', 'main', 'terminal-main')]: main,
      [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-feature')]: feature,
      [createTerminalStateKey('project-beta', 'main', 'terminal-other')]: otherProject
    }

    expect(removeWorkspaceTerminalStates(states, 'project-alpha', 'feature/sidebar')).toEqual({
      [createTerminalStateKey('project-alpha', 'main', 'terminal-main')]: main,
      [createTerminalStateKey('project-beta', 'main', 'terminal-other')]: otherProject
    })
  })

  it('drops removed workspaces and missing current graph terminals while keeping hidden worktrees', () => {
    const main = createState('main', 'terminal-main', 1)
    const deletedMain = createState('main', 'terminal-deleted', 1)
    const feature = createState('feature/sidebar', 'terminal-feature', 1)
    const archived = createState('feature/archived', 'terminal-archived', 1)

    expect(
      reconcileTerminalStates(
        {
          [createTerminalStateKey('project-alpha', 'main', 'terminal-main')]: main,
          [createTerminalStateKey('project-alpha', 'main', 'terminal-deleted')]: deletedMain,
          [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-feature')]: feature,
          [createTerminalStateKey('project-alpha', 'feature/archived', 'terminal-archived')]:
            archived
        },
        {
          projectId: 'project-alpha',
          workspaceNames: ['main', 'feature/sidebar'],
          currentWorkspaceName: 'main',
          currentTerminalBlockIds: ['terminal-main']
        }
      )
    ).toEqual({
      [createTerminalStateKey('project-alpha', 'main', 'terminal-main')]: main,
      [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-feature')]: feature
    })
  })
})

function createState(
  workspaceName: string,
  blockId: string,
  generation: number,
  projectId = 'project-alpha'
): TerminalViewState {
  return {
    sessionId: `session-${blockId}`,
    status: 'running',
    output: '',
    runIdentity: {
      projectId,
      workspaceName,
      blockId,
      sessionId: `session-${blockId}`,
      runId: `run-${blockId}`,
      generation
    }
  }
}
