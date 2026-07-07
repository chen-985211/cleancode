import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { updateTerminalBlockStatus, updateTerminalStatus } from './terminalStateUpdates'
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
  const [terminalStates, setTerminalStates] = useState<Record<string, TerminalViewState>>({})
  const terminalStatesRef = useRef<Record<string, TerminalViewState>>({})
  const inputBuffersRef = useRef<Map<string, TerminalInputBuffer>>(new Map())
  const inputWriteQueuesRef = useRef<Map<string, Promise<void>>>(new Map())
  const quickLaunchesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    terminalStatesRef.current = terminalStates
  }, [terminalStates])

  const updateTerminalStates = useCallback(
    (stateAction: SetStateAction<Record<string, TerminalViewState>>) => {
      const nextStates =
        typeof stateAction === 'function' ? stateAction(terminalStatesRef.current) : stateAction

      terminalStatesRef.current = nextStates
      setTerminalStates(nextStates)
    },
    []
  )

  const clearPendingTerminalInput = useCallback((blockId: string) => {
    const buffer = inputBuffersRef.current.get(blockId)

    if (buffer?.timerId != null) {
      window.clearTimeout(buffer.timerId)
    }

    inputBuffersRef.current.delete(blockId)
  }, [])

  const flushTerminalInput = useCallback((blockId: string) => {
    const buffer = inputBuffersRef.current.get(blockId)

    if (!buffer || buffer.input.length === 0) {
      return
    }

    inputBuffersRef.current.delete(blockId)
    const queuedWrite = inputWriteQueuesRef.current.get(blockId) ?? Promise.resolve()
    const nextWrite = queuedWrite
      .catch(() => undefined)
      .then(async () => {
        const terminalState = terminalStatesRef.current[blockId]

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

    inputWriteQueuesRef.current.set(blockId, nextWrite)
    void nextWrite.finally(() => {
      if (inputWriteQueuesRef.current.get(blockId) === nextWrite) {
        inputWriteQueuesRef.current.delete(blockId)
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
      updateTerminalStates((states) => appendTerminalOutput(states, event))
      window.dispatchEvent(
        new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, { detail: event })
      )
    })
    const unsubscribeExit = api.onTerminalExit((event) => {
      const exitedBlockId = findTerminalBlockIdBySession(terminalStatesRef.current, event.sessionId)

      if (exitedBlockId) {
        clearPendingTerminalInput(exitedBlockId)
      }

      updateTerminalStates((states) => updateTerminalStatus(states, event.sessionId, 'exited'))
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
    }
  }, [clearPendingTerminalInput, updateTerminalStates])

  const startTerminal = useCallback(
    async (
      block: TerminalBlockSnapshot,
      dimensions: TerminalDimensions
    ): Promise<TerminalSessionSnapshot | undefined> => {
      if (!currentWorkspace) {
        return undefined
      }

      clearPendingTerminalInput(block.id)
      const session = await window.cleancode?.startTerminal({
        terminalBlockId: block.id,
        workspaceName: currentWorkspace.name,
        workingDirectory: currentWorkspace.directory,
        columns: dimensions.columns,
        rows: dimensions.rows
      })

      if (session) {
        updateTerminalStates((states) => ({
          ...states,
          [block.id]: {
            sessionId: session.id,
            status: session.status,
            output: ''
          }
        }))
      }

      return session
    },
    [clearPendingTerminalInput, currentWorkspace, updateTerminalStates]
  )

  const interruptTerminal = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalState = terminalStatesRef.current[block.id]

      if (terminalState?.sessionId && terminalState.status === 'running') {
        clearPendingTerminalInput(block.id)
        await window.cleancode?.interruptTerminal({ sessionId: terminalState.sessionId })
      }
    },
    [clearPendingTerminalInput]
  )

  const terminateTerminalSession = useCallback(
    async (block: TerminalBlockSnapshot) => {
      const terminalState = terminalStatesRef.current[block.id]

      clearPendingTerminalInput(block.id)
      updateTerminalStates((states) => updateTerminalBlockStatus(states, block.id, 'exited'))

      if (terminalState?.sessionId && window.cleancode) {
        await window.cleancode.terminateTerminal({ sessionId: terminalState.sessionId })
      }
    },
    [clearPendingTerminalInput, updateTerminalStates]
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

  const quickLaunchTerminal = useCallback(
    async (block: TerminalBlockSnapshot, options: TerminalSessionActionOptions = {}) => {
      const launchCommand = block.launchCommand.trim()

      if (!launchCommand || !window.cleancode) {
        return
      }

      if (quickLaunchesRef.current.has(block.id)) {
        return
      }

      quickLaunchesRef.current.add(block.id)

      try {
        await terminateTerminalSession(block)
        const session = await startTerminal(block, defaultTerminalDimensions)

        if (session?.status === 'running') {
          await window.cleancode.writeTerminal({
            sessionId: session.id,
            input: `${launchCommand}\r`
          })
        }

        if (shouldFocusTerminalAfterAction(options)) {
          window.setTimeout(() => focusTerminalBlock(block.id), 80)
        }
      } finally {
        quickLaunchesRef.current.delete(block.id)
      }
    },
    [focusTerminalBlock, startTerminal, terminateTerminalSession]
  )

  const writeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, input: string) => {
      const terminalState = terminalStatesRef.current[block.id]

      if (terminalState?.sessionId && terminalState.status === 'running' && window.cleancode) {
        const currentBuffer = inputBuffersRef.current.get(block.id)

        if (currentBuffer && currentBuffer.sessionId !== terminalState.sessionId) {
          clearPendingTerminalInput(block.id)
        }

        const buffer = inputBuffersRef.current.get(block.id)

        if (buffer) {
          inputBuffersRef.current.set(block.id, {
            ...buffer,
            input: `${buffer.input}${input}`
          })
          return
        }

        const timerId = window.setTimeout(() => flushTerminalInput(block.id), 16)
        const nextBuffer: TerminalInputBuffer = {
          sessionId: terminalState.sessionId,
          input,
          timerId
        }

        inputBuffersRef.current.set(block.id, nextBuffer)
      }
    },
    [clearPendingTerminalInput, flushTerminalInput]
  )

  const resizeTerminal = useCallback(
    async (block: TerminalBlockSnapshot, dimensions: TerminalDimensions) => {
      const terminalState = terminalStatesRef.current[block.id]

      if (terminalState?.sessionId && terminalState.status === 'running') {
        await window.cleancode?.resizeTerminal({
          sessionId: terminalState.sessionId,
          columns: dimensions.columns,
          rows: dimensions.rows
        })
      }
    },
    []
  )

  const terminateWorkbenchTerminalSessions = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      const terminalStatesByBlockId = terminalStatesRef.current
      const sessionIds = workbench.graph.blocks
        .map((block) => terminalStatesByBlockId[block.id]?.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId))

      updateTerminalStates((states) => {
        const nextStates = { ...states }

        for (const block of workbench.graph.blocks) {
          clearPendingTerminalInput(block.id)
          delete nextStates[block.id]
        }

        return nextStates
      })

      await Promise.all(
        sessionIds.map((sessionId) => window.cleancode?.terminateTerminal({ sessionId }))
      )
    },
    [clearPendingTerminalInput, updateTerminalStates]
  )

  return {
    interruptTerminal,
    quickLaunchTerminal,
    resizeTerminal,
    restartTerminal,
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

interface TerminalInputBuffer {
  readonly sessionId: string
  readonly input: string
  readonly timerId: number | null
}

function appendTerminalOutput(
  states: Record<string, TerminalViewState>,
  event: TerminalOutputEvent
): Record<string, TerminalViewState> {
  return Object.fromEntries(
    Object.entries(states).map(([blockId, state]) => [
      blockId,
      state.sessionId === event.sessionId
        ? { ...state, output: appendTerminalOutputTail(state.output, event.data) }
        : state
    ])
  )
}

function findTerminalBlockIdBySession(
  states: Record<string, TerminalViewState>,
  sessionId: string
): string | null {
  return Object.entries(states).find(([, state]) => state.sessionId === sessionId)?.[0] ?? null
}
