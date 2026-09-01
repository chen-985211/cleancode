import { renderHook } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'

import type { TerminalSessionSnapshot } from '../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalViewState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { useTerminalStarter } from '../../../src/presentation/app-shell/coordinators/useTerminalStarter'
import { createDeferred } from '../../fixtures/deferred'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('terminal starter runtime epochs', () => {
  it('starts in a new epoch without waiting for the stale attempt and ignores its completion', async () => {
    const staleSession = createDeferred<TerminalSessionSnapshot>()
    const currentSession = createDeferred<TerminalSessionSnapshot>()
    const startTerminal = vi
      .fn()
      .mockReturnValueOnce(staleSession.promise)
      .mockReturnValueOnce(currentSession.promise)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ startTerminal })
    })
    const workbench = createWorkbenchSnapshot('/work/project', 'project')
    const terminalStatesRef = { current: {} as Record<string, TerminalViewState> }
    const updateTerminalStates: Dispatch<SetStateAction<Record<string, TerminalViewState>>> = (
      action
    ) => {
      terminalStatesRef.current =
        typeof action === 'function' ? action(terminalStatesRef.current) : action
    }
    const bindTerminalSession = vi.fn()
    const onFailure = vi.fn()
    const { result, rerender } = renderHook(
      ({ isRuntimeReady, runtimeEpoch }) =>
        useTerminalStarter({
          bindTerminalSession,
          clearPendingTerminalInput: vi.fn(),
          currentProject: workbench.project,
          currentWorkspace: workbench.project.workspaces[0],
          isRuntimeReady,
          onFailure,
          runtimeEpoch,
          terminalStatesRef,
          updateTerminalStates
        }),
      { initialProps: { isRuntimeReady: true, runtimeEpoch: 1 } }
    )

    const staleStart = result.current(terminalBlock(), { columns: 80, rows: 24 })
    rerender({ isRuntimeReady: true, runtimeEpoch: 2 })
    const currentStart = result.current(terminalBlock(), { columns: 80, rows: 24 })

    expect(startTerminal).toHaveBeenCalledTimes(2)

    staleSession.resolve(sessionSnapshot('stale-session'))
    await staleStart
    expect(bindTerminalSession).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()

    currentSession.resolve(sessionSnapshot('current-session'))
    await currentStart
    expect(bindTerminalSession).toHaveBeenCalledOnce()
    expect(bindTerminalSession).toHaveBeenCalledWith(
      '["project-project","main","terminal","terminal-1"]',
      expect.objectContaining({ id: 'current-session' })
    )
  })

  it('invalidates a pending attempt when the runtime becomes unavailable in the same epoch', async () => {
    const staleSession = createDeferred<TerminalSessionSnapshot>()
    const currentSession = createDeferred<TerminalSessionSnapshot>()
    const startTerminal = vi
      .fn()
      .mockReturnValueOnce(staleSession.promise)
      .mockReturnValueOnce(currentSession.promise)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ startTerminal })
    })
    const workbench = createWorkbenchSnapshot('/work/project', 'project')
    const terminalStatesRef = { current: {} as Record<string, TerminalViewState> }
    const updateTerminalStates: Dispatch<SetStateAction<Record<string, TerminalViewState>>> = (
      action
    ) => {
      terminalStatesRef.current =
        typeof action === 'function' ? action(terminalStatesRef.current) : action
    }
    const bindTerminalSession = vi.fn()
    const onFailure = vi.fn()
    const { result, rerender } = renderHook(
      ({ isRuntimeReady }) =>
        useTerminalStarter({
          bindTerminalSession,
          clearPendingTerminalInput: vi.fn(),
          currentProject: workbench.project,
          currentWorkspace: workbench.project.workspaces[0],
          isRuntimeReady,
          onFailure,
          runtimeEpoch: 1,
          terminalStatesRef,
          updateTerminalStates
        }),
      { initialProps: { isRuntimeReady: true } }
    )

    const staleStart = result.current(terminalBlock(), { columns: 80, rows: 24 })
    rerender({ isRuntimeReady: false })
    staleSession.resolve(sessionSnapshot('stale-session'))
    await staleStart

    expect(bindTerminalSession).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()

    rerender({ isRuntimeReady: true })
    const currentStart = result.current(terminalBlock(), { columns: 80, rows: 24 })
    currentSession.resolve(sessionSnapshot('current-session'))
    await currentStart

    expect(startTerminal).toHaveBeenCalledTimes(2)
    expect(bindTerminalSession).toHaveBeenCalledWith(
      '["project-project","main","terminal","terminal-1"]',
      expect.objectContaining({ id: 'current-session' })
    )
  })
})

function terminalBlock() {
  return {
    description: 'Local shell',
    id: 'terminal-1',
    launchCommand: '',
    name: 'Terminal',
    position: { x: 0, y: 0 },
    size: { height: 360, width: 640 },
    type: 'terminal' as const
  }
}

function sessionSnapshot(id: string): TerminalSessionSnapshot {
  return {
    id,
    sessionId: id,
    runId: `run-${id}`,
    generation: 1,
    projectId: 'project-project',
    projectDirectory: '/work/project',
    workspaceId: 'main',
    workspaceDirectory: '/work/project',
    gitBranch: null,
    blockId: 'terminal-1',
    terminalBlockId: 'terminal-1',
    workingDirectory: '/work/project',
    processId: 42,
    status: 'running',
    kind: 'interactive',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    terminalSourceTheme: 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}
