import { act, renderHook } from '@testing-library/react'

import type { TerminalWorkingDirectoryChangedEvent } from '../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  terminalWorkspaceEventFreshnessMs,
  terminalWorkspaceFallbackIntervalMs,
  useTerminalWorkspaceSynchronization
} from '../../../src/presentation/app-shell/useTerminalWorkspaceSynchronization'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('terminal workspace synchronization cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDocumentVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pauses fallback inspection while hidden and refreshes when visible again', async () => {
    const listTerminalWorkingDirectories = vi.fn(async () => [])
    installRuntime(listTerminalWorkingDirectories)
    const { unmount } = renderSynchronizationHook()

    await flushEffects()
    expect(listTerminalWorkingDirectories).toHaveBeenCalledTimes(1)

    setDocumentVisibility('hidden')
    await act(async () => {
      vi.advanceTimersByTime(terminalWorkspaceFallbackIntervalMs * 2)
    })
    expect(listTerminalWorkingDirectories).toHaveBeenCalledTimes(1)

    setDocumentVisibility('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(listTerminalWorkingDirectories).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('suppresses fallback inspection while working-directory events are fresh', async () => {
    const listTerminalWorkingDirectories = vi.fn(async () => [])
    let publish: ((event: TerminalWorkingDirectoryChangedEvent) => void) | undefined
    installRuntime(
      listTerminalWorkingDirectories,
      vi.fn((listener: (event: TerminalWorkingDirectoryChangedEvent) => void) => {
        publish = listener
        return vi.fn()
      })
    )
    const { unmount } = renderSynchronizationHook()
    await flushEffects()

    act(() => publish?.(workingDirectoryEvent()))
    await act(async () => {
      vi.advanceTimersByTime(terminalWorkspaceEventFreshnessMs - 1)
    })
    expect(listTerminalWorkingDirectories).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(listTerminalWorkingDirectories).toHaveBeenCalledTimes(2)
    unmount()
  })
})

function renderSynchronizationHook() {
  return renderHook(() =>
    useTerminalWorkspaceSynchronization({
      currentWorkbench: workbench(),
      findTerminalBlockIdForSession: () => null,
      moveTerminalSessionToWorkspace: () => false,
      replaceWorkbench: () => undefined,
      runningSessionIds: ['session-1']
    })
  )
}

function installRuntime(
  listTerminalWorkingDirectories: ReturnType<typeof vi.fn>,
  onTerminalWorkingDirectoryChanged: ReturnType<typeof vi.fn> = vi.fn(() => vi.fn())
): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: createRuntimeApi({
      listTerminalWorkingDirectories,
      onTerminalWorkingDirectoryChanged
    })
  })
}

function workbench() {
  return createWorkbenchSnapshot('/work/app', 'app', {
    gitBranch: 'main',
    workspaces: [
      {
        workspaceId: 'main',
        workspaceKind: 'default',
        displayName: 'main',
        directory: '/work/app',
        gitBranch: 'main',
        isCurrent: true
      },
      {
        workspaceId: 'feature',
        workspaceKind: 'linked-worktree',
        displayName: 'feature',
        directory: '/work/app-worktrees/feature',
        gitBranch: 'feature',
        isCurrent: false
      }
    ]
  })
}

function workingDirectoryEvent(): TerminalWorkingDirectoryChangedEvent {
  return {
    revision: 1,
    scope: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'terminal-1', kind: 'block' },
      projectDirectory: '/work/app',
      projectId: 'project-app',
      runId: 'run-1',
      sessionId: 'session-1',
      workspaceDirectory: '/work/app',
      workspaceId: 'main'
    },
    sessionId: 'session-1',
    workingDirectory: '/work/app/src'
  }
}

function setDocumentVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

async function flushEffects(): Promise<void> {
  await act(async () => Promise.resolve())
}
