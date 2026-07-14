import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getWorkspaceNameFromTerminalStateKey,
  migrateTerminalSessionToWorkspace
} from './terminalSessionWorkspaceMigration'
import { updateTerminalBlockStatus, updateTerminalStatus } from './terminalStateUpdates'
import {
  findTerminalStateKeyBySession,
  resolveCurrentTerminalStateKey,
  selectTerminalStatesForWorkspace
} from './terminalSessionStateSelectors'
import {
  appendTerminalOutput,
  bufferTerminalStartupOutput,
  takeTerminalStartupOutput,
  type TerminalInputBuffer
} from './terminalSessionOutputBuffer'
import { applyTerminalWorkflowEventToStates } from './terminalWorkflowSessionEvents'
import {
  defaultTerminalDimensions,
  terminalOutputBrowserEventName,
  type TerminalDimensions,
  type TerminalViewState,
  type WorkbenchSnapshot
} from './types'

type CurrentWorkspace = WorkbenchSnapshot['project']['workspaces'][number]

interface UseTerminalSessionsInput {
  readonly currentWorkspace: CurrentWorkspace | undefined
  readonly focusTerminalBlock: (blockId: string) => void
}

export interface TerminalSessionActionOptions {
  readonly shouldFocus?: boolean
}

export function useTerminalSessions({
  currentWorkspace,
  focusTerminalBlock
}: UseTerminalSessionsInput) {
  const [terminalStatesByKey, setTerminalStatesByKey] = useState<Record<string, TerminalViewState>>(
    {}
  )
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const inputBuffersRef = useRef<Map<string, TerminalInputBuffer>>(new Map())
  const inputWriteQueuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const terminalStartupOutputsRef = useRef<Map<string, string>>(new Map())
  const quickLaunchesRef = useRef<Set<string>>(new Set())
  const currentWorkspaceName = currentWorkspace?.name ?? null
  const terminalStates = useMemo(
    () => selectTerminalStatesForWorkspace(terminalStatesByKey, currentWorkspaceName),
    [currentWorkspaceName, terminalStatesByKey]
  )
  const runningSessionIds = useMemo(
    () =>
      Object.values(terminalStates)
        .filter((state) => state.status === 'running' && state.sessionId)
        .map((state) => state.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId)),
    [terminalStates]
  )

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

  const clearPendingTerminalInput = useCallback((terminalStateKey: string) => {
    const buffer = inputBuffersRef.current.get(terminalStateKey)

    if (buffer?.timerId != null) {
      window.clearTimeout(buffer.timerId)
    }

    inputBuffersRef.current.delete(terminalStateKey)
  }, [])

  const flushTerminalInput = useCallback((terminalStateKey: string) => {
    const buffer = inputBuffersRef.current.get(terminalStateKey)

    if (!buffer || buffer.input.length === 0) {
      return
    }

    inputBuffersRef.current.delete(terminalStateKey)
    const queuedWrite = inputWriteQueuesRef.current.get(terminalStateKey) ?? Promise.resolve()
    const nextWrite = queuedWrite
      .catch(() => undefined)
      .then(async () => {
        const terminalState = terminalStatesRef.current[terminalStateKey]

        if (
          terminalState?.sessionId !== buffer.sessionId ||
          terminalState.status !== 'running' ||
          !window.cleancode
        ) {
          return
        }

        await window.cleancode.writeTerminal({
          sessionId: buffer.sessionId,
          input: buffer.input
        })
      })

    inputWriteQueuesRef.current.set(terminalStateKey, nextWrite)
    void nextWrite.finally(() => {
      if (inputWriteQueuesRef.current.get(terminalStateKey) === nextWrite) {
        inputWriteQueuesRef.current.delete(terminalStateKey)
      }
    })
  }, [])

  useEffect(
    () => () => {
      for (const buffer of inputBuffersRef.current.values()) {
        if (buffer.timerId !== null) {
          window.clearTimeout(buffer.timerId)
        }
      }

      inputBuffersRef.current.clear()
      inputWriteQueuesRef.current.clear()
      terminalStartupOutputsRef.current.clear()
      quickLaunchesRef.current.clear()
    },
    []
  )

  useEffect(() => {
    const api = window.cleancode

    if (!api) {
      return undefined
    }

    const unsubscribeOutput = api.onTerminalOutput((event) => {
      if (!findTerminalStateKeyBySession(terminalStatesRef.current, event.sessionId)) {
        bufferTerminalStartupOutput(terminalStartupOutputsRef.current, event)
      }
      updateTerminalStates((states) => appendTerminalOutput(states, event))
      window.dispatchEvent(
        new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, { detail: event })
      )
    })
    const unsubscribeExit = api.onTerminalExit((event) => {
      const exitedTerminalStateKey = findTerminalStateKeyBySession(
        terminalStatesRef.current,
        event.sessionId
      )

      if (exitedTerminalStateKey) {
        clearPendingTerminalInput(exitedTerminalStateKey)
      }

      updateTerminalStates((states) => updateTerminalStatus(states, event.sessionId, 'exited'))
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
    }
  }, [clearPendingTerminalInput, updateTerminalStates])

  useEffect(() => {
    const api = window.cleancode

    if (!api || typeof api.onTerminalWorkflowEvent !== 'function') {
      return undefined
    }

    return api.onTerminalWorkflowEvent((event) => {
      if (event.type === 'terminal-session-started') {
        clearPendingTerminalInput(
          createTerminalStateKey(event.session.workspaceName, event.blockId)
        )
      }
      if (event.type === 'terminal-output') {
        window.dispatchEvent(
          new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, {
            detail: event.output
          })
        )
      }

      updateTerminalStates((states) => applyTerminalWorkflowEventToStates(states, event))
    })
  }, [clearPendingTerminalInput, updateTerminalStates])

  const startTerminal = useCallback(
    async (
      block: TerminalBlockSnapshot,
      dimensions: TerminalDimensions
    ): Promise<TerminalSessionSnapshot | undefined> => {
      if (!currentWorkspace) {
        return undefined
      }

      const terminalStateKey = createTerminalStateKey(currentWorkspace.name, block.id)

      clearPendingTerminalInput(terminalStateKey)
      const session = await window.cleancode?.startTerminal({
        terminalBlockId: block.id,
        workspaceName: currentWorkspace.name,
        workingDirectory: currentWorkspace.directory,
        columns: dimensions.columns,
        rows: dimensions.rows
      })

      if (session) {
        const startupOutput = takeTerminalStartupOutput(
          terminalStartupOutputsRef.current,
          session.id
        )
        updateTerminalStates((states) => ({
          ...states,
          [terminalStateKey]: {
            sessionId: session.id,
            status: session.status,
            output: startupOutput
          }
        }))
      }

      return session
    },
    [clearPendingTerminalInput, currentWorkspace, updateTerminalStates]
  )

  const interruptTerminal = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(currentWorkspaceName, block.id)
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (terminalStateKey && terminalState?.sessionId && terminalState.status === 'running') {
        clearPendingTerminalInput(terminalStateKey)
        await window.cleancode?.interruptTerminal({ sessionId: terminalState.sessionId })
      }
    },
    [clearPendingTerminalInput, currentWorkspaceName]
  )

  const terminateTerminalSession = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(currentWorkspaceName, block.id)
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
    [clearPendingTerminalInput, currentWorkspaceName, updateTerminalStates]
  )

  const restartTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      await terminateTerminalSession(block)
      await startTerminal(block, defaultTerminalDimensions)

      if (shouldFocusTerminalAfterAction(options)) {
        window.setTimeout(() => focusTerminalBlock(block.id), 80)
      }
    },
    [focusTerminalBlock, startTerminal, terminateTerminalSession]
  )

  const writeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, input: string) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(currentWorkspaceName, block.id)
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
    [clearPendingTerminalInput, currentWorkspaceName, flushTerminalInput]
  )

  const quickLaunchTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      const launchCommand = block.launchCommand.trim()

      if (!launchCommand || !window.cleancode) {
        return
      }

      const terminalStateKey = resolveCurrentTerminalStateKey(currentWorkspaceName, block.id)

      if (!terminalStateKey || quickLaunchesRef.current.has(terminalStateKey)) {
        return
      }

      quickLaunchesRef.current.add(terminalStateKey)

      try {
        await terminateTerminalSession(block)
        const session = await startTerminal(block, defaultTerminalDimensions)

        if (session?.status === 'running') {
          await writeTerminal(block, `${launchCommand}\r`)
        }

        if (shouldFocusTerminalAfterAction(options)) {
          window.setTimeout(() => focusTerminalBlock(block.id), 80)
        }
      } finally {
        quickLaunchesRef.current.delete(terminalStateKey)
      }
    },
    [
      currentWorkspaceName,
      focusTerminalBlock,
      startTerminal,
      terminateTerminalSession,
      writeTerminal
    ]
  )

  const resizeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      const terminalStateKey = resolveCurrentTerminalStateKey(currentWorkspaceName, block.id)
      const terminalState = terminalStateKey
        ? terminalStatesRef.current[terminalStateKey]
        : undefined

      if (terminalState?.sessionId && terminalState.status === 'running') {
        await window.cleancode?.resizeTerminal({
          sessionId: terminalState.sessionId,
          columns: dimensions.columns,
          rows: dimensions.rows
        })
      }
    },
    [currentWorkspaceName]
  )

  const terminateWorkbenchTerminalSessions = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      const workspaceNames = new Set(
        workbench.project.workspaces.map((workspace) => workspace.name)
      )
      const terminalStateKeys = Object.keys(terminalStatesRef.current).filter((terminalStateKey) =>
        workspaceNames.has(getWorkspaceNameFromTerminalStateKey(terminalStateKey))
      )
      const sessionIds = terminalStateKeys
        .map((terminalStateKey) => terminalStatesRef.current[terminalStateKey]?.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId))

      updateTerminalStates((states) => {
        const nextStates = { ...states }

        for (const terminalStateKey of terminalStateKeys) {
          clearPendingTerminalInput(terminalStateKey)
          delete nextStates[terminalStateKey]
        }

        return nextStates
      })

      await Promise.all(
        sessionIds.map((sessionId) => window.cleancode?.terminateTerminal({ sessionId }))
      )
    },
    [clearPendingTerminalInput, updateTerminalStates]
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
        targetWorkspaceName,
        getBlockIdFromTerminalStateKey(sourceTerminalStateKey)
      )
      let hasMigrated = false

      clearPendingTerminalInput(sourceTerminalStateKey)
      clearPendingTerminalInput(targetTerminalStateKey)
      updateTerminalStates((states) => {
        const result = migrateTerminalSessionToWorkspace(states, {
          sessionId,
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

  return {
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
    terminalStatesRef,
    terminateTerminalSession,
    terminateWorkbenchTerminalSessions,
    writeTerminal
  }
}

function shouldFocusTerminalAfterAction(options: TerminalSessionActionOptions): boolean {
  return options.shouldFocus !== false
}
