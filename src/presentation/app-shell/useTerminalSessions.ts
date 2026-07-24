import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  migrateTerminalSessionToWorkspace
} from './terminalSessionWorkspaceMigration'
import { updateTerminalBlockStatus } from './terminalStateUpdates'
import {
  findTerminalStateKeyBySession,
  resolveCurrentTerminalStateKey
} from './terminalSessionStateSelectors'
import { takeTerminalStartupOutput, type TerminalInputBuffer } from './terminalSessionOutputBuffer'
import { dismissTerminalPortConflict } from './terminalServiceRunProjection'
import { useTerminalSessionEvents } from './useTerminalSessionEvents'
import { useTerminalSessionRetention } from './useTerminalSessionRetention'
import type { NotifyApp } from './appNotifications'
import { notifyTerminalLaunchFailure } from './terminalSessionNotifications'
import { resolveUserFacingErrorMessage } from './appErrorMessages'
import { TerminalSurfaceRegistry } from './terminalSurfaceRegistry'
import {
  inheritTerminalRetention,
  shouldInheritTerminalRetention
} from './terminalRetentionInheritance'
import { useI18n } from './i18n/useI18n'
import {
  applyTerminalSessionSnapshot,
  applyTerminalSessionStatusSnapshot,
  launchTerminalRuntimeSession,
  reconcileTerminalSessionSnapshots,
  startTerminalRuntimeSession
} from './terminalSessionRuntime'
import { readTerminalSourceTheme } from './terminalTheme'
import { useTerminalRuntimeRecovery } from './useTerminalRuntimeRecovery'
import {
  defaultTerminalDimensions,
  type TerminalDimensions,
  type TerminalViewState,
  type WorkbenchSnapshot
} from './types'

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
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const [terminalSurfaceRegistry] = useState(() => new TerminalSurfaceRegistry())
  const inputBuffersRef = useRef<Map<string, TerminalInputBuffer>>(new Map())
  const inputWriteQueuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const terminalStartupOutputsRef = useRef<Map<string, string>>(new Map())
  const terminalStartsRef = useRef<Set<string>>(new Set())
  const quickLaunchesRef = useRef<Set<string>>(new Set())
  const delayedFocusTimersRef = useRef<Set<number>>(new Set())
  const isMountedRef = useRef(true)
  const currentProjectId = currentProject?.id ?? null
  const currentWorkspaceName = currentWorkspace?.name ?? null
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

  const terminalStates = useTerminalRuntimeRecovery({
    currentProjectId,
    currentTerminalBlockIds,
    currentWorkspaceName,
    runtimeAvailability,
    terminalStatesByKey,
    updateTerminalStates
  })
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

  useEffect(() => {
    const api = window.cleancode
    if (!api?.listTerminalSessions || !currentProjectId || !currentWorkspaceName) return undefined

    const requestedRuns = Object.values(terminalStatesRef.current).flatMap((state) =>
      state.status === 'running' &&
      state.runIdentity?.projectId === currentProjectId &&
      state.runIdentity.workspaceName === currentWorkspaceName
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
  }, [currentProjectId, currentWorkspaceName, updateTerminalStates])

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
    currentWorkspaceName,
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
      terminalStartsRef.current.clear()
      quickLaunchesRef.current.clear()
      terminalSurfaceRegistry.disposeAll()
    }
  }, [terminalSurfaceRegistry])

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

  const startTerminal = useCallback(
    async (
      block: TerminalBlockSnapshot,
      dimensions: TerminalDimensions
    ): Promise<TerminalSessionSnapshot | undefined> => {
      if (!currentProject || !currentWorkspace || !isRuntimeReady) {
        return undefined
      }

      const terminalStateKey = createTerminalStateKey(
        currentProject.id,
        currentWorkspace.name,
        block.id
      )
      if (terminalStartsRef.current.has(terminalStateKey)) {
        return undefined
      }

      terminalStartsRef.current.add(terminalStateKey)
      clearPendingTerminalInput(terminalStateKey)
      try {
        const session = await startTerminalRuntimeSession({
          projectId: currentProject.id,
          projectDirectory: currentProject.directory,
          terminalBlockId: block.id,
          workspaceName: currentWorkspace.name,
          workspaceDirectory: currentWorkspace.directory,
          gitBranch: currentWorkspace.gitBranch,
          columns: dimensions.columns,
          rows: dimensions.rows,
          terminalSourceTheme: readTerminalSourceTheme()
        })

        if (session) bindTerminalSession(terminalStateKey, session)
        return session
      } catch (error) {
        notifyTerminalLaunchFailure(notify, error, t)
        return undefined
      } finally {
        terminalStartsRef.current.delete(terminalStateKey)
      }
    },
    [
      bindTerminalSession,
      clearPendingTerminalInput,
      currentProject,
      currentWorkspace,
      isRuntimeReady,
      notify,
      t
    ]
  )

  const interruptTerminal = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceName,
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
      currentWorkspaceName,
      reconcileTerminalActionSnapshot
    ]
  )

  const terminateTerminalSession = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceName,
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
    [clearPendingTerminalInput, currentProjectId, currentWorkspaceName, updateTerminalStates]
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
        currentWorkspaceName,
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
    [currentProjectId, currentWorkspaceName, notify, reconcileTerminalActionSnapshot, t]
  )

  const writeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, input: string) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceName,
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
    [clearPendingTerminalInput, currentProjectId, currentWorkspaceName, flushTerminalInput]
  )

  const writeTerminalImmediately = useCallback(
    async (block: TerminalBlockSnapshot, input: string): Promise<void> => {
      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceName,
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
    [currentProjectId, currentWorkspaceName, enqueueTerminalInputWrite]
  )

  const quickLaunchTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      if (!block.launchCommand.trim() || !currentProject || !currentWorkspace || !isRuntimeReady) {
        return
      }

      const terminalStateKey = resolveCurrentTerminalStateKey(
        currentProjectId,
        currentWorkspaceName,
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
          workspaceName: currentWorkspace.name,
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
      currentWorkspaceName,
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
        currentWorkspaceName,
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
    [currentProjectId, currentWorkspaceName, reconcileTerminalActionSnapshot]
  )

  const findTerminalBlockIdForSession = useCallback((sessionId: string): string | null => {
    const terminalStateKey = findTerminalStateKeyBySession(terminalStatesRef.current, sessionId)

    return terminalStateKey ? getBlockIdFromTerminalStateKey(terminalStateKey) : null
  }, [])

  const moveTerminalSessionToWorkspace = useCallback(
    (sessionId: string, targetWorkspaceName: string, targetBlockId?: string): boolean => {
      const sourceTerminalStateKey = findTerminalStateKeyBySession(
        terminalStatesRef.current,
        sessionId
      )

      if (!sourceTerminalStateKey) {
        return false
      }

      const targetTerminalStateKey = createTerminalStateKey(
        getProjectIdFromTerminalStateKey(sourceTerminalStateKey),
        targetWorkspaceName,
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
          targetWorkspaceName
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
    resizeTerminal,
    restartTerminal,
    runningSessionIds,
    moveTerminalSessionToWorkspace,
    setTerminalStates: updateTerminalStates,
    startTerminal,
    terminalStates,
    terminalSurfaceRegistry,
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
