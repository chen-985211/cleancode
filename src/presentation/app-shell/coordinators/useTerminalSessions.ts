import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction
} from 'react'

import type { TerminalBlockSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionSnapshot } from '../../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../../contexts/run/application/dto/TerminalRuntimeAvailability'
import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  migrateTerminalSessionToWorkspace
} from '../../../contexts/run/presentation/view-models/terminalSessionWorkspaceMigration'
import { updateTerminalBlockStatus } from '../../../contexts/run/presentation/view-models/terminalStateUpdates'
import {
  findTerminalStateKeyBySession,
  resolveCurrentTerminalStateKey
} from '../../../contexts/run/presentation/view-models/terminalSessionStateSelectors'
import {
  takeTerminalStartupOutput,
  type TerminalInputBuffer
} from '../../../contexts/run/presentation/view-models/terminalSessionOutputBuffer'
import { dismissTerminalPortConflict } from '../../../contexts/run/presentation/view-models/terminalServiceRunProjection'
import { useTerminalSessionEvents } from '../../../contexts/run/presentation/view-models/useTerminalSessionEvents'
import { useTerminalSessionRetention } from '../useTerminalSessionRetention'
import type { NotifyApp } from '../../shared/notifications/appNotifications'
import { notifyTerminalLaunchFailure } from '../terminalSessionNotifications'
import { resolveUserFacingErrorMessage } from '../../shared/errors/appErrorMessages'
import { TerminalSurfaceRegistry } from '../../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import { readTerminalSourceTheme } from '../../../contexts/run/presentation/terminal-surface/terminalTheme'
import { TerminalWorkloadScheduler } from '../../../contexts/run/presentation/terminal-surface/terminalWorkloadScheduler'
import { TerminalZoomRasterCoordinator } from '../../../contexts/run/presentation/terminal-surface/terminalZoomRasterCoordinator'
import { createTerminalStateStore } from '../../../contexts/run/presentation/view-models/terminalStateStore'
import { createTerminalRenderingWorkloadCoordinator } from './terminalRenderingWorkloadCoordinator'
import {
  inheritTerminalRetention,
  shouldInheritTerminalRetention
} from '../../../contexts/run/presentation/view-models/terminalRetentionInheritance'
import { useI18n } from '../../i18n/useI18n'
import {
  applyTerminalSessionSnapshot,
  applyTerminalSessionStatusSnapshot,
  launchTerminalRuntimeSession,
  projectTerminalAutoStartStatus,
  reconcileTerminalSessionSnapshots
} from '../../../contexts/run/presentation/view-models/terminalSessionRuntime'
import { useTerminalRuntimeRecovery } from '../../../contexts/run/presentation/view-models/useTerminalRuntimeRecovery'
import { useTerminalStarter } from './useTerminalStarter'
import { useTerminalViewIdentityReconciliation } from '../../../contexts/run/presentation/view-models/useTerminalViewIdentityReconciliation'
import type { TerminalViewState } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import { defaultTerminalDimensions } from '../types/terminalFlowNode'
import type { TerminalDimensions } from '../../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalSessionsInput {
  readonly currentProject: WorkbenchSnapshot['project'] | undefined
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly currentTerminalBlockIds: readonly string[] | undefined
  readonly focusTerminalBlock: (blockId: string) => void
  readonly notify: NotifyApp
  readonly runtimeAvailability: TerminalRuntimeAvailabilitySnapshot
}

export interface TerminalSessionActionOptions {
  readonly shouldFocus?: boolean
}

export function useTerminalSessions({
  currentProject,
  currentWorkspace,
  currentTerminalBlockIds,
  focusTerminalBlock,
  notify,
  runtimeAvailability
}: UseTerminalSessionsInput) {
  const { t } = useI18n()
  const [terminalStatesByKey, setTerminalStatesByKey] = useState<Record<string, TerminalViewState>>(
    {}
  )
  const [terminalStateStore] = useState(createTerminalStateStore)
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const [terminalZoomRasterCoordinator] = useState(() => new TerminalZoomRasterCoordinator())
  const [terminalWorkloadScheduler] = useState(() => new TerminalWorkloadScheduler())
  const [terminalRenderingWorkloadCoordinator] = useState(() =>
    createTerminalRenderingWorkloadCoordinator(
      terminalZoomRasterCoordinator,
      terminalWorkloadScheduler
    )
  )
  const [terminalSurfaceRegistry] = useState(
    () =>
      new TerminalSurfaceRegistry(
        undefined,
        undefined,
        terminalZoomRasterCoordinator,
        terminalWorkloadScheduler
      )
  )
  const inputBuffersRef = useRef<Map<string, TerminalInputBuffer>>(new Map())
  const inputWriteQueuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const terminalStartupOutputsRef = useRef<Map<string, string>>(new Map())
  const quickLaunchesRef = useRef<Set<string>>(new Set())
  const delayedFocusTimersRef = useRef<Set<number>>(new Set())
  const isMountedRef = useRef(true)
  const currentProjectId = currentProject?.id ?? null
  const currentWorkspaceId = currentWorkspace?.workspaceId ?? null
  const isRuntimeReady = runtimeAvailability.phase === 'ready'

  useEffect(() => {
    terminalStatesRef.current = terminalStatesByKey
  }, [terminalStatesByKey])

  const updateTerminalStates = useCallback(
    (stateAction: SetStateAction<Record<string, TerminalViewState>>) => {
      const nextStates =
        typeof stateAction === 'function' ? stateAction(terminalStatesRef.current) : stateAction

      terminalStatesRef.current = nextStates
      setTerminalStatesByKey(nextStates)
    },
    []
  )

  const recoveredTerminalStates = useTerminalRuntimeRecovery({
    currentProjectId,
    currentTerminalBlockIds,
    currentWorkspaceId,
    runtimeAvailability,
    terminalStatesByKey,
    updateTerminalStates
  })
  const terminalStates = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(recoveredTerminalStates).map(([blockId, state]) => [
          blockId,
          projectTerminalAutoStartStatus(state, runtimeAvailability.epoch)
        ])
      ),
    [recoveredTerminalStates, runtimeAvailability.epoch]
  )
  useLayoutEffect(() => {
    terminalStateStore.replaceStates(terminalStates)
  }, [terminalStateStore, terminalStates])
  const runningSessionIds = useMemo(
    () =>
      Object.values(terminalStates)
        .filter((state) => state.status === 'running' && state.sessionId)
        .map((state) => state.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    [terminalStates]
  )

  const reconcileTerminalActionSnapshot = useCallback(
    (terminalStateKey: string, session: TerminalSessionSnapshot) => {
      updateTerminalStates((states) =>
        applyTerminalSessionStatusSnapshot(states, terminalStateKey, session)
      )
    },
    [updateTerminalStates]
  )

  const reconcileStaleTerminalView = useTerminalViewIdentityReconciliation(updateTerminalStates)

  useEffect(() => {
    const api = window.cleancode
    if (!api?.listTerminalSessions || !currentProjectId || !currentWorkspaceId) return undefined

    const requestedRuns = Object.values(terminalStatesRef.current).flatMap((state) =>
      state.status === 'running' &&
      state.runIdentity?.projectId === currentProjectId &&
      state.runIdentity.workspaceId === currentWorkspaceId
        ? [state.runIdentity]
        : []
    )
    if (requestedRuns.length === 0) return undefined

    let isCurrentRequest = true
    void api
      .listTerminalSessions({ sessionIds: requestedRuns.map((run) => run.sessionId) })
      .then((sessions) => {
        if (!isCurrentRequest) return
        updateTerminalStates((states) =>
          reconcileTerminalSessionSnapshots(states, requestedRuns, sessions)
        )
      })
      .catch(() => undefined)

    return () => {
      isCurrentRequest = false
    }
  }, [currentProjectId, currentWorkspaceId, updateTerminalStates])

  const clearPendingTerminalInput = useCallback((terminalStateKey: string) => {
    const buffer = inputBuffersRef.current.get(terminalStateKey)

    if (buffer?.timerId != null) {
      window.clearTimeout(buffer.timerId)
    }

    inputBuffersRef.current.delete(terminalStateKey)
  }, [])

  const terminalSessionRetention = useTerminalSessionRetention({
    clearPendingTerminalInput,
    currentProject,
    currentTerminalBlockIds,
    currentWorkspaceId,
    terminalStatesRef,
    updateTerminalStates
  })

  const enqueueTerminalInputWrite = useCallback(
    (terminalStateKey: string, sessionId: string, input: string): Promise<void> => {
      const queuedWrite = inputWriteQueuesRef.current.get(terminalStateKey) ?? Promise.resolve()
      const nextWrite = queuedWrite
        .catch(() => undefined)
        .then(async () => {
          const terminalState = terminalStatesRef.current[terminalStateKey]
          if (
            terminalState?.sessionId !== sessionId ||
            terminalState.status !== 'running' ||
            !window.cleancode
          ) {
            return
          }
          const session = await window.cleancode.writeTerminal({ sessionId, input })
          reconcileTerminalActionSnapshot(terminalStateKey, session)
        })

      inputWriteQueuesRef.current.set(terminalStateKey, nextWrite)
      void nextWrite.finally(() => {
        if (inputWriteQueuesRef.current.get(terminalStateKey) === nextWrite) {
          inputWriteQueuesRef.current.delete(terminalStateKey)
        }
      })
      return nextWrite
    },
    [reconcileTerminalActionSnapshot]
  )

  const flushTerminalInput = useCallback(
    (terminalStateKey: string) => {
      const buffer = inputBuffersRef.current.get(terminalStateKey)

      if (!buffer || buffer.input.length === 0) {
        return
      }

      inputBuffersRef.current.delete(terminalStateKey)
      void enqueueTerminalInputWrite(terminalStateKey, buffer.sessionId, buffer.input)
    },
    [enqueueTerminalInputWrite]
  )

  const scheduleTerminalFocus = useCallback(
    (blockId: string) => {
      if (!isMountedRef.current) return

      const timerId = window.setTimeout(() => {
        delayedFocusTimersRef.current.delete(timerId)
        if (isMountedRef.current) focusTerminalBlock(blockId)
      }, 80)
      delayedFocusTimersRef.current.add(timerId)
    },
    [focusTerminalBlock]
  )

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      for (const timerId of delayedFocusTimersRef.current) {
        window.clearTimeout(timerId)
      }
      delayedFocusTimersRef.current.clear()

      for (const buffer of inputBuffersRef.current.values()) {
        if (buffer.timerId !== null) {
          window.clearTimeout(buffer.timerId)
        }
      }

      inputBuffersRef.current.clear()
      inputWriteQueuesRef.current.clear()
      terminalStartupOutputsRef.current.clear()
      quickLaunchesRef.current.clear()
      terminalSurfaceRegistry.disposeAll()
      queueMicrotask(() => {
        // React StrictMode immediately replays effects with the same stateful owners. Defer the
        // terminal check by one microtask so only a real unmount disposes the shared coordinator.
        if (!isMountedRef.current) {
          terminalZoomRasterCoordinator.dispose()
          terminalWorkloadScheduler.dispose()
        }
      })
    }
  }, [terminalSurfaceRegistry, terminalWorkloadScheduler, terminalZoomRasterCoordinator])

  useTerminalSessionEvents({
    clearPendingTerminalInput,
    terminalStartupOutputsRef,
    terminalSurfaceRegistry,
    terminalStatesRef,
    updateTerminalStates
  })

  const bindTerminalSession = useCallback(
    (
      terminalStateKey: string,
      session: TerminalSessionSnapshot,
      actualEndpoint: TerminalViewState['actualEndpoint'] = null
    ) => {
      const output = takeTerminalStartupOutput(terminalStartupOutputsRef.current, session)
      const endpoint = actualEndpoint ?? null
      updateTerminalStates((states) =>
        applyTerminalSessionSnapshot(states, terminalStateKey, session, output, endpoint)
      )
    },
    [updateTerminalStates]
  )
  const notifyTerminalStartFailure = useCallback(
    (error: unknown) => notifyTerminalLaunchFailure(notify, error, t),
    [notify, t]
  )
  const startTerminal = useTerminalStarter({
    bindTerminalSession,
    clearPendingTerminalInput,
    currentProject,
    currentWorkspace,
    isRuntimeReady,
    onFailure: notifyTerminalStartFailure,
    runtimeEpoch: runtimeAvailability.epoch,
    terminalStatesRef,
    updateTerminalStates
  })

  const interruptTerminal = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (terminalStateKey && terminalState?.sessionId && terminalState.status === 'running') {
        clearPendingTerminalInput(terminalStateKey)
        const session = await window.cleancode?.interruptTerminal({
          sessionId: terminalState.sessionId
        })
        if (session) reconcileTerminalActionSnapshot(terminalStateKey, session)
      }
    },
    [
      clearPendingTerminalInput,
      currentProjectId,
      currentWorkspaceId,
      reconcileTerminalActionSnapshot
    ]
  )

  const terminateTerminalSession = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (!terminalStateKey) {
        return
      }

      clearPendingTerminalInput(terminalStateKey)
      updateTerminalStates((states) =>
        updateTerminalBlockStatus(states, terminalStateKey, 'exited')
      )

      if (terminalState?.sessionId && window.cleancode) {
        await window.cleancode.terminateTerminal({ sessionId: terminalState.sessionId })
      }
    },
    [clearPendingTerminalInput, currentProjectId, currentWorkspaceId, updateTerminalStates]
  )

  const restartTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      await terminateTerminalSession(block)
      await startTerminal(block, defaultTerminalDimensions)

      if (shouldFocusTerminalAfterAction(options)) {
        scheduleTerminalFocus(block.id)
      }
    },
    [scheduleTerminalFocus, startTerminal, terminateTerminalSession]
  )

  const toggleTerminalRetention = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const state = terminalStateKey ? terminalStatesRef.current[terminalStateKey] : undefined
      if (
        !terminalStateKey ||
        !state?.sessionId ||
        state.status !== 'running' ||
        state.sessionKind === 'workflow' ||
        !window.cleancode?.setTerminalRetention
      ) {
        return
      }
      const retentionPolicy =
        state.retentionPolicy === 'keep-after-application-exit'
          ? 'terminate-on-application-exit'
          : 'keep-after-application-exit'
      try {
        const session = await window.cleancode.setTerminalRetention({
          sessionId: state.sessionId,
          retentionPolicy
        })
        reconcileTerminalActionSnapshot(terminalStateKey, session)
      } catch (error) {
        notify({
          kind: 'error',
          title: t('terminal.retention.failedTitle'),
          message: resolveUserFacingErrorMessage(error, 'terminal.retention.failed', t)
        })
      }
    },
    [currentProjectId, currentWorkspaceId, notify, reconcileTerminalActionSnapshot, t]
  )

  const writeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, input: string) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (
        terminalStateKey &&
        terminalState?.sessionId &&
        terminalState.status === 'running' &&
        window.cleancode
      ) {
        const currentBuffer = inputBuffersRef.current.get(terminalStateKey)

        if (currentBuffer && currentBuffer.sessionId !== terminalState.sessionId) {
          clearPendingTerminalInput(terminalStateKey)
        }

        const buffer = inputBuffersRef.current.get(terminalStateKey)

        if (buffer) {
          inputBuffersRef.current.set(terminalStateKey, {
            ...buffer,
            input: `${buffer.input}${input}`
          })
          return
        }

        const timerId = window.setTimeout(() => flushTerminalInput(terminalStateKey), 16)
        const nextBuffer: TerminalInputBuffer = {
          sessionId: terminalState.sessionId,
          input,
          timerId
        }

        inputBuffersRef.current.set(terminalStateKey, nextBuffer)
      }
    },
    [clearPendingTerminalInput, currentProjectId, currentWorkspaceId, flushTerminalInput]
  )

  const writeTerminalImmediately = useCallback(
    async (block: TerminalBlockSnapshot, input: string): Promise<void> => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined
      if (!terminalStateKey || !terminalState?.sessionId || terminalState.status !== 'running') {
        return
      }

      const buffer = inputBuffersRef.current.get(terminalStateKey)
      if (buffer?.timerId != null) window.clearTimeout(buffer.timerId)
      inputBuffersRef.current.delete(terminalStateKey)
      if (buffer?.sessionId === terminalState.sessionId && buffer.input) {
        void enqueueTerminalInputWrite(terminalStateKey, terminalState.sessionId, buffer.input)
      }
      await enqueueTerminalInputWrite(terminalStateKey, terminalState.sessionId, input)
    },
    [currentProjectId, currentWorkspaceId, enqueueTerminalInputWrite]
  )

  const quickLaunchTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      if (!block.launchCommand.trim() || !currentProject || !currentWorkspace || !isRuntimeReady) {
        return
      }

      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )

      if (!terminalStateKey || quickLaunchesRef.current.has(terminalStateKey)) {
        return
      }

      const shouldInheritRetention = shouldInheritTerminalRetention(
        terminalStatesRef.current[terminalStateKey]
      )

      quickLaunchesRef.current.add(terminalStateKey)

      try {
        await terminateTerminalSession(block)
        const result = await launchTerminalRuntimeSession({
          projectId: currentProject.id,
          projectDirectory: currentProject.directory,
          terminalBlockId: block.id,
          workspaceId: currentWorkspace.workspaceId,
          workspaceDirectory: currentWorkspace.directory,
          gitBranch: currentWorkspace.gitBranch,
          columns: defaultTerminalDimensions.columns,
          rows: defaultTerminalDimensions.rows,
          terminalSourceTheme: readTerminalSourceTheme()
        })

        if (result) {
          const session = await inheritTerminalRetention(
            result.session,
            shouldInheritRetention,
            (error) =>
              notify({
                kind: 'error',
                title: t('terminal.retention.failedTitle'),
                message: resolveUserFacingErrorMessage(error, 'terminal.retention.failed', t)
              })
          )

          bindTerminalSession(terminalStateKey, session, result.endpoint)
        }

        if (shouldFocusTerminalAfterAction(options)) {
          scheduleTerminalFocus(block.id)
        }
      } catch (error) {
        notifyTerminalLaunchFailure(notify, error, t)
      } finally {
        quickLaunchesRef.current.delete(terminalStateKey)
      }
    },
    [
      currentProjectId,
      currentWorkspaceId,
      bindTerminalSession,
      currentProject,
      currentWorkspace,
      isRuntimeReady,
      notify,
      scheduleTerminalFocus,
      t,
      terminateTerminalSession
    ]
  )

  const resizeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceId,
        block.id
      )
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (terminalState?.sessionId && terminalState.status === 'running') {
        const session = await window.cleancode?.resizeTerminal({
          sessionId: terminalState.sessionId,
          columns: dimensions.columns,
          rows: dimensions.rows
        })
        if (session && terminalStateKey) {
          reconcileTerminalActionSnapshot(terminalStateKey, session)
        }
      }
    },
    [currentProjectId, currentWorkspaceId, reconcileTerminalActionSnapshot]
  )

  const findTerminalBlockIdForSession = useCallback((sessionId: string): string | null => {
    const terminalStateKey = findTerminalStateKeyBySession(terminalStatesRef.current, sessionId)

    return terminalStateKey ? getBlockIdFromTerminalStateKey(terminalStateKey) : null
  }, [])

  const moveTerminalSessionToWorkspace = useCallback(
    (sessionId: string, targetWorkspaceId: string, targetBlockId?: string): boolean => {
      const sourceTerminalStateKey = findTerminalStateKeyBySession(
        terminalStatesRef.current,
        sessionId
      )

      if (!sourceTerminalStateKey) {
        return false
      }

      const targetTerminalStateKey = createTerminalStateKey(
        getProjectIdFromTerminalStateKey(sourceTerminalStateKey),
        targetWorkspaceId,
        getBlockIdFromTerminalStateKey(sourceTerminalStateKey)
      )
      let hasMigrated = false

      clearPendingTerminalInput(sourceTerminalStateKey)
      clearPendingTerminalInput(targetTerminalStateKey)
      updateTerminalStates((states) => {
        const result = migrateTerminalSessionToWorkspace(states, {
          sessionId,
          targetProjectId: getProjectIdFromTerminalStateKey(sourceTerminalStateKey),
          targetBlockId,
          targetWorkspaceId
        })

        hasMigrated = result.migrated

        return result.states
      })

      return hasMigrated
    },
    [clearPendingTerminalInput, updateTerminalStates]
  )

  const dismissPortConflictForRun = useCallback(
    (identity: Parameters<typeof dismissTerminalPortConflict>[1]) =>
      updateTerminalStates((states) => dismissTerminalPortConflict(states, identity)),
    [updateTerminalStates]
  )

  return {
    dismissPortConflict: dismissPortConflictForRun,
    findTerminalBlockIdForSession,
    interruptTerminal,
    quickLaunchTerminal,
    reconcileStaleTerminalView,
    resizeTerminal,
    restartTerminal,
    runningSessionIds,
    moveTerminalSessionToWorkspace,
    setTerminalStates: updateTerminalStates,
    startTerminal,
    terminalStateProjection: { states: terminalStates, store: terminalStateStore },
    terminalSurfaceRegistry,
    terminalZoomRasterCoordinator: terminalRenderingWorkloadCoordinator,
    terminalStatesRef,
    terminateTerminalSession,
    toggleTerminalRetention,
    ...terminalSessionRetention,
    writeTerminal,
    writeTerminalImmediately
  }
}

function shouldFocusTerminalAfterAction(options: TerminalSessionActionOptions): boolean {
  return options.shouldFocus !== false
}
