import { describe, expect, it } from 'vitest'

import {
  createTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  migrateTerminalSessionToWorkspace
} from '../../../src/presentation/app-shell/terminalSessionWorkspaceMigration'
import type { TerminalViewState } from '../../../src/presentation/app-shell/types'

describe('terminal session workspace migration', () => {
  it('moves a running terminal session to the matching branch workspace key', () => {
    const runningState: TerminalViewState = {
      sessionId: 'session-main',
      status: 'running',
      output: 'server ready'
    }
    const idleState: TerminalViewState = {
      sessionId: null,
      status: 'idle',
      output: ''
    }

    const result = migrateTerminalSessionToWorkspace(
      {
        [createTerminalStateKey('project-alpha', 'main', 'terminal-1')]: runningState,
        [createTerminalStateKey('project-alpha', 'main', 'terminal-2')]: idleState
      },
      {
        sessionId: 'session-main',
        targetProjectId: 'project-alpha',
        targetWorkspaceId: 'feature/sidebar'
      }
    )

    expect(result).toEqual({
      migrated: true,
      states: {
        [createTerminalStateKey('project-alpha', 'main', 'terminal-2')]: idleState,
        [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-1')]: runningState
      }
    })
  })

  it('does not duplicate a session that already belongs to the target workspace', () => {
    const runningState: TerminalViewState = {
      sessionId: 'session-feature',
      status: 'running',
      output: ''
    }
    const states = {
      [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-1')]: runningState
    }

    const result = migrateTerminalSessionToWorkspace(states, {
      sessionId: 'session-feature',
      targetProjectId: 'project-alpha',
      targetWorkspaceId: 'feature/sidebar'
    })

    expect(result).toEqual({ migrated: false, states })
  })

  it('can move a session to a newly created target workspace block', () => {
    const runningState: TerminalViewState = {
      sessionId: 'session-main',
      status: 'running',
      output: 'ready'
    }

    const result = migrateTerminalSessionToWorkspace(
      {
        [createTerminalStateKey('project-alpha', 'main', 'terminal-1')]: runningState
      },
      {
        sessionId: 'session-main',
        targetProjectId: 'project-alpha',
        targetBlockId: 'terminal-worktree',
        targetWorkspaceId: 'feature/sidebar'
      }
    )

    expect(result).toEqual({
      migrated: true,
      states: {
        [createTerminalStateKey('project-alpha', 'feature/sidebar', 'terminal-worktree')]:
          runningState
      }
    })
  })

  it('keeps identical workspace and block identities isolated by project', () => {
    const alphaKey = createTerminalStateKey('project-alpha', 'main', 'terminal-1')
    const betaKey = createTerminalStateKey('project-beta', 'main', 'terminal-1')

    expect(alphaKey).not.toBe(betaKey)
    expect(getProjectIdFromTerminalStateKey(alphaKey)).toBe('project-alpha')
    expect(getProjectIdFromTerminalStateKey(betaKey)).toBe('project-beta')
  })
})
