import { describe, expect, it } from 'vitest'

import {
  createTerminalStateKey,
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
        [createTerminalStateKey('main', 'terminal-1')]: runningState,
        [createTerminalStateKey('main', 'terminal-2')]: idleState
      },
      {
        sessionId: 'session-main',
        targetWorkspaceName: 'feature/sidebar'
      }
    )

    expect(result).toEqual({
      migrated: true,
      states: {
        [createTerminalStateKey('main', 'terminal-2')]: idleState,
        [createTerminalStateKey('feature/sidebar', 'terminal-1')]: runningState
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
      [createTerminalStateKey('feature/sidebar', 'terminal-1')]: runningState
    }

    const result = migrateTerminalSessionToWorkspace(states, {
      sessionId: 'session-feature',
      targetWorkspaceName: 'feature/sidebar'
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
        [createTerminalStateKey('main', 'terminal-1')]: runningState
      },
      {
        sessionId: 'session-main',
        targetBlockId: 'terminal-worktree',
        targetWorkspaceName: 'feature/sidebar'
      }
    )

    expect(result).toEqual({
      migrated: true,
      states: {
        [createTerminalStateKey('feature/sidebar', 'terminal-worktree')]: runningState
      }
    })
  })
})
