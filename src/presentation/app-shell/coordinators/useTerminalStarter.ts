import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'

import type { TerminalBlockSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionSnapshot } from '../../../contexts/run/application/dto/TerminalSessionSnapshot'
import { createTerminalStateKey } from '../../../contexts/run/presentation/view-models/terminalSessionWorkspaceMigration'
import {
  beginTerminalAutoStart,
  failTerminalAutoStart,
  startTerminalRuntimeSession
} from '../../../contexts/run/presentation/view-models/terminalSessionRuntime'
import { readTerminalSourceTheme } from '../../../contexts/run/presentation/terminal-surface/terminalTheme'
import type { TerminalViewState } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { TerminalDimensions } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

type CurrentProject = WorkbenchSnapshot['project']
type CurrentWorkspace = CurrentProject['workspaces'][number]
type TerminalStates = Record<string, TerminalViewState>

interface UseTerminalStarterInput {
  readonly bindTerminalSession: (terminalStateKey: string, session: TerminalSessionSnapshot) => void
  readonly clearPendingTerminalInput: (terminalStateKey: string) => void
  readonly currentProject: CurrentProject | undefined
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly isRuntimeReady: boolean
  readonly onFailure: (error: unknown) => void
  readonly runtimeEpoch: number
  readonly terminalStatesRef: RefObject<TerminalStates>
  readonly updateTerminalStates: Dispatch<SetStateAction<TerminalStates>>
}

export function useTerminalStarter({
  bindTerminalSession,
  clearPendingTerminalInput,
  currentProject,
  currentWorkspace,
  isRuntimeReady,
  onFailure,
  runtimeEpoch,
  terminalStatesRef,
  updateTerminalStates
}: UseTerminalStarterInput) {
  const runtimeAuthorityRef = useRef({ isRuntimeReady, runtimeEpoch })
  const terminalStartsRef = useRef<Map<string, TerminalStartAttempt>>(new Map())

  useLayoutEffect(() => {
    runtimeAuthorityRef.current = { isRuntimeReady, runtimeEpoch }
    for (const [terminalStateKey, attempt] of terminalStartsRef.current) {
      if (!isRuntimeReady || attempt.runtimeEpoch !== runtimeEpoch) {
        terminalStartsRef.current.delete(terminalStateKey)
      }
    }
  }, [isRuntimeReady, runtimeEpoch])

  useEffect(() => () => terminalStartsRef.current.clear(), [])

  return useCallback(
    async (
      block: TerminalBlockSnapshot,
      dimensions: TerminalDimensions
    ): Promise<TerminalSessionSnapshot | undefined> => {
      if (!currentProject || !currentWorkspace || !isRuntimeReady) return undefined

      const terminalStateKey = createTerminalStateKey(
        currentProject.id,
        currentWorkspace.workspaceId,
        block.id
      )
      const currentState = terminalStatesRef.current[terminalStateKey]
      if (
        terminalStartsRef.current.get(terminalStateKey)?.runtimeEpoch === runtimeEpoch ||
        (currentState?.status === 'running' && Boolean(currentState.sessionId))
      ) {
        return undefined
      }

      const attempt = { runtimeEpoch }
      terminalStartsRef.current.set(terminalStateKey, attempt)
      const isCurrentAttempt = (): boolean => {
        const authority = runtimeAuthorityRef.current
        return (
          authority.isRuntimeReady &&
          authority.runtimeEpoch === runtimeEpoch &&
          terminalStartsRef.current.get(terminalStateKey) === attempt
        )
      }
      clearPendingTerminalInput(terminalStateKey)
      updateTerminalStates((states) =>
        beginTerminalAutoStart(states, terminalStateKey, runtimeEpoch)
      )
      try {
        const session = await startTerminalRuntimeSession({
          projectId: currentProject.id,
          projectDirectory: currentProject.directory,
          terminalBlockId: block.id,
          workspaceId: currentWorkspace.workspaceId,
          workspaceDirectory: currentWorkspace.directory,
          gitBranch: currentWorkspace.gitBranch,
          columns: dimensions.columns,
          rows: dimensions.rows,
          terminalSourceTheme: readTerminalSourceTheme()
        })

        if (!isCurrentAttempt()) return undefined
        if (!session) {
          updateTerminalStates((states) =>
            failTerminalAutoStart(states, terminalStateKey, runtimeEpoch)
          )
          return undefined
        }
        bindTerminalSession(terminalStateKey, session)
        return session
      } catch (error) {
        if (!isCurrentAttempt()) return undefined
        updateTerminalStates((states) =>
          failTerminalAutoStart(states, terminalStateKey, runtimeEpoch)
        )
        onFailure(error)
        return undefined
      } finally {
        if (terminalStartsRef.current.get(terminalStateKey) === attempt) {
          terminalStartsRef.current.delete(terminalStateKey)
        }
      }
    },
    [
      bindTerminalSession,
      clearPendingTerminalInput,
      currentProject,
      currentWorkspace,
      isRuntimeReady,
      onFailure,
      runtimeEpoch,
      terminalStatesRef,
      updateTerminalStates
    ]
  )
}

interface TerminalStartAttempt {
  readonly runtimeEpoch: number
}
