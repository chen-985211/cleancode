import { act, renderHook } from '@testing-library/react'

import type { TerminalWorkingDirectoryChangedEvent } from '../../../src/contexts/run/application/ports/TerminalProcessPort'
import {
  manualWorkspaceSelectionBrowserEventName,
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

  it('drains only the newest working-directory event after an in-flight switch fails', async () => {
    const firstSwitch = deferred<ReturnType<typeof workbench>>()
    const switchBranchWorkspace = vi
      .fn()
      .mockImplementationOnce(() => firstSwitch.promise)
      .mockResolvedValue(workbench())
    let publish: ((event: TerminalWorkingDirectoryChangedEvent) => void) | undefined
    installRuntime(
      vi.fn(async () => []),
      vi.fn((listener: (event: TerminalWorkingDirectoryChangedEvent) => void) => {
        publish = listener
        return vi.fn()
      }),
      switchBranchWorkspace
    )
    const { unmount } = renderSynchronizationHook()
    await flushEffects()

    act(() => publish?.(workingDirectoryEvent('session-1', '/work/app-worktrees/feature/src', 1)))
    await flushEffects()
    expect(switchBranchWorkspace).toHaveBeenCalledWith({
      projectDirectory: '/work/app',
      workspaceId: 'feature'
    })

    act(() => publish?.(workingDirectoryEvent('session-1', '/work/app-worktrees/other/src', 2)))
    act(() =>
      publish?.(workingDirectoryEvent('session-1', '/work/app-worktrees/other/packages', 3))
    )
    firstSwitch.reject(new Error('switch failed'))
    await flushEffects()
    await flushEffects()

    expect(switchBranchWorkspace).toHaveBeenLastCalledWith({
      projectDirectory: '/work/app',
      workspaceId: 'other'
    })
    expect(switchBranchWorkspace).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('does not consume a manual selection revision from a partial event snapshot', async () => {
    const listTerminalWorkingDirectories = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { sessionId: 'session-2', workingDirectory: '/work/app-worktrees/other/src' }
      ])
    const switchBranchWorkspace = vi.fn(async () => workbench())
    let publish: ((event: TerminalWorkingDirectoryChangedEvent) => void) | undefined
    installRuntime(
      listTerminalWorkingDirectories,
      vi.fn((listener: (event: TerminalWorkingDirectoryChangedEvent) => void) => {
        publish = listener
        return vi.fn()
      }),
      switchBranchWorkspace
    )
    const { unmount } = renderSynchronizationHook(['session-1', 'session-2'])
    await flushEffects()

    act(() => {
      window.dispatchEvent(new CustomEvent(manualWorkspaceSelectionBrowserEventName))
      publish?.(workingDirectoryEvent('session-1', '/work/app-worktrees/feature/src', 1))
    })
    await flushEffects()
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await flushEffects()

    expect(listTerminalWorkingDirectories).toHaveBeenLastCalledWith({
      sessionIds: ['session-2']
    })
    expect(switchBranchWorkspace).not.toHaveBeenCalled()
    unmount()
  })
})

function renderSynchronizationHook(runningSessionIds: readonly string[] = ['session-1']) {
  return renderHook(() =>
    useTerminalWorkspaceSynchronization({
      currentWorkbench: workbench(),
      findTerminalBlockIdForSession: () => null,
      moveTerminalSessionToWorkspace: () => false,
      replaceWorkbench: () => undefined,
      runningSessionIds
    })
  )
}

function installRuntime(
  listTerminalWorkingDirectories: ReturnType<typeof vi.fn>,
  onTerminalWorkingDirectoryChanged: ReturnType<typeof vi.fn> = vi.fn(() => vi.fn()),
  switchBranchWorkspace: ReturnType<typeof vi.fn> = vi.fn()
): void {
  Object.defineProperty(window, 'cleancode', {
    configurable: true,
    value: createRuntimeApi({
      listTerminalWorkingDirectories,
      onTerminalWorkingDirectoryChanged,
      switchBranchWorkspace
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
      },
      {
        workspaceId: 'other',
        workspaceKind: 'linked-worktree',
        displayName: 'other',
        directory: '/work/app-worktrees/other',
        gitBranch: 'other',
        isCurrent: false
      }
    ]
  })
}

function workingDirectoryEvent(
  sessionId = 'session-1',
  workingDirectory = '/work/app/src',
  revision = 1
): TerminalWorkingDirectoryChangedEvent {
  return {
    revision,
    scope: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'terminal-1', kind: 'block' },
      projectDirectory: '/work/app',
      projectId: 'project-app',
      runId: 'run-1',
      sessionId,
      workspaceDirectory: '/work/app',
      workspaceId: 'main'
    },
    sessionId,
    workingDirectory
  }
}

function setDocumentVisibility(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

async function flushEffects(): Promise<void> {
  await act(async () => Promise.resolve())
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly reject: (error: unknown) => void
} {
  let rejectPromise: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((_resolve, reject) => {
    rejectPromise = reject
  })
  return { promise, reject: rejectPromise }
}
