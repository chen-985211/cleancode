import { useEffect, useRef } from 'react'

import {
  defaultTerminalExecutionConfig,
  type TerminalBlockSnapshot
} from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalWorkingDirectoryChangedEvent } from '../../../contexts/run/application/ports/TerminalProcessPort'
import { findWorkspaceByDirectory } from '../context-adapters/project/workspaceDirectoryMatching'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

export const terminalWorkspaceFallbackIntervalMs = 15_000
export const terminalWorkspaceEventFreshnessMs = 45_000
export const manualWorkspaceSelectionBrowserEventName = 'cleancode-manual-workspace-selection'

interface UseTerminalWorkspaceSynchronizationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly findTerminalBlockIdForSession: (sessionId: string) => string | null
  readonly moveTerminalSessionToWorkspace: (
    sessionId: string,
    targetWorkspaceId: string,
    targetBlockId?: string
  ) => boolean
  readonly replaceWorkbench: (workbench: WorkbenchSnapshot) => void
  readonly runningSessionIds: readonly string[]
}

export function useTerminalWorkspaceSynchronization({
  currentWorkbench,
  findTerminalBlockIdForSession,
  moveTerminalSessionToWorkspace,
  replaceWorkbench,
  runningSessionIds
}: UseTerminalWorkspaceSynchronizationInput): void {
  const runningSessionIdsKey = runningSessionIds.join('\0')
  const projectDirectory = currentWorkbench?.project.directory ?? null
  const currentWorkspaceId =
    currentWorkbench?.project.workspaces.find((workspace) => workspace.isCurrent)?.workspaceId ??
    null
  const manualWorkspaceSelectionRevisionRef = useRef(0)
  const observedManualWorkspaceSelectionRevisionRef = useRef(0)
  const suppressedWorkingDirectoriesRef = useRef<Map<string, string>>(new Map())
  const workingDirectoryEventTimesRef = useRef<Map<string, number>>(new Map())
  const workingDirectoryEventVersionsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const markManualWorkspaceSelection = (): void => {
      manualWorkspaceSelectionRevisionRef.current += 1
    }

    window.addEventListener(manualWorkspaceSelectionBrowserEventName, markManualWorkspaceSelection)

    return () => {
      window.removeEventListener(
        manualWorkspaceSelectionBrowserEventName,
        markManualWorkspaceSelection
      )
    }
  }, [])

  useEffect(() => {
    const api = window.cleancode
    const currentWorkspace = currentWorkbench?.project.workspaces.find(
      (workspace) => workspace.isCurrent
    )

    if (
      !api?.listTerminalWorkingDirectories ||
      !api.switchBranchWorkspace ||
      !currentWorkbench ||
      !projectDirectory ||
      !currentWorkspace ||
      currentWorkbench.project.workspaces.length < 2 ||
      runningSessionIds.length === 0
    ) {
      return undefined
    }

    let isDisposed = false
    let isQuerying = false
    let synchronizationTail = Promise.resolve()
    let workingDirectoryEventDrain: Promise<void> | null = null
    const pendingWorkingDirectoryEvents = new Map<string, TerminalWorkingDirectoryChangedEvent>()
    const runningSessionIdSet = new Set(runningSessionIds)
    for (const sessionId of workingDirectoryEventTimesRef.current.keys()) {
      if (!runningSessionIdSet.has(sessionId)) {
        workingDirectoryEventTimesRef.current.delete(sessionId)
        workingDirectoryEventVersionsRef.current.delete(sessionId)
      }
    }

    const synchronizeTerminalWorkspace = async (
      workingDirectories: readonly TerminalWorkingDirectoryEntry[],
      isCompleteSnapshot: boolean
    ): Promise<void> => {
      try {
        forgetChangedSuppressedWorkingDirectories(
          suppressedWorkingDirectoriesRef.current,
          workingDirectories
        )

        if (
          manualWorkspaceSelectionRevisionRef.current !==
          observedManualWorkspaceSelectionRevisionRef.current
        ) {
          rememberSuppressedWorkingDirectories(
            suppressedWorkingDirectoriesRef.current,
            workingDirectories
          )
          if (isCompleteSnapshot) {
            observedManualWorkspaceSelectionRevisionRef.current =
              manualWorkspaceSelectionRevisionRef.current
          }
          return
        }

        const matchedTerminalWorkspace = workingDirectories
          .filter(
            (entry) =>
              suppressedWorkingDirectoriesRef.current.get(entry.sessionId) !==
              entry.workingDirectory
          )
          .map((entry) => ({
            entry,
            workspace: findWorkspaceByDirectory(
              currentWorkbench.project.workspaces,
              entry.workingDirectory
            )
          }))
          .find(
            ({ workspace }) => workspace && workspace.workspaceId !== currentWorkspace.workspaceId
          )

        if (!matchedTerminalWorkspace?.workspace || isDisposed) {
          return
        }

        const { entry, workspace } = matchedTerminalWorkspace

        const sourceBlockId = findTerminalBlockIdForSession(entry.sessionId)
        const sourceBlock =
          currentWorkbench.graph.blocks.find((block) => block.id === sourceBlockId) ?? null

        const switchedWorkbench = await api.switchBranchWorkspace({
          projectDirectory,
          workspaceId: workspace.workspaceId
        })
        const ensured = await ensureTerminalBlockForMigratedSession({
          projectDirectory,
          sourceBlock,
          switchedWorkbench,
          workspaceId: workspace.workspaceId
        })

        moveTerminalSessionToWorkspace(
          entry.sessionId,
          workspace.workspaceId,
          ensured.targetBlockId ?? undefined
        )

        if (!isDisposed) {
          replaceWorkbench(ensured.workbench)
        }
      } catch {
        // Keep the last visible workspace if terminal cwd inspection or switching fails.
      }
    }

    const enqueueTerminalWorkspaceSynchronization = (
      workingDirectories: readonly TerminalWorkingDirectoryEntry[],
      isCompleteSnapshot: boolean
    ): Promise<void> => {
      const queued = synchronizationTail.then(async () => {
        if (isDisposed) return
        await synchronizeTerminalWorkspace(workingDirectories, isCompleteSnapshot)
      })
      synchronizationTail = queued.catch(() => undefined)
      return queued
    }

    const drainWorkingDirectoryEvents = (): void => {
      if (workingDirectoryEventDrain) return
      workingDirectoryEventDrain = (async () => {
        while (!isDisposed && pendingWorkingDirectoryEvents.size > 0) {
          const nextEvent = pendingWorkingDirectoryEvents.entries().next()
          if (nextEvent.done) break
          const [sessionId, event] = nextEvent.value
          pendingWorkingDirectoryEvents.delete(sessionId)
          await enqueueTerminalWorkspaceSynchronization([event], false)
        }
      })().finally(() => {
        workingDirectoryEventDrain = null
        if (!isDisposed && pendingWorkingDirectoryEvents.size > 0) {
          drainWorkingDirectoryEvents()
        }
      })
    }

    const synchronizeFallback = async (includeFreshSessions = false): Promise<void> => {
      if (isQuerying || document.visibilityState === 'hidden') return
      const now = Date.now()
      const sessionIds = includeFreshSessions
        ? runningSessionIds
        : runningSessionIds.filter(
            (sessionId) =>
              now - (workingDirectoryEventTimesRef.current.get(sessionId) ?? 0) >=
              terminalWorkspaceEventFreshnessMs
          )
      if (sessionIds.length === 0) return

      const eventVersionsBeforeQuery = new Map(
        sessionIds.map((sessionId) => [
          sessionId,
          workingDirectoryEventVersionsRef.current.get(sessionId) ?? 0
        ])
      )
      isQuerying = true
      try {
        const workingDirectories = await api.listTerminalWorkingDirectories({ sessionIds })
        if (!isDisposed) {
          const supersededSessionIds = new Set(
            sessionIds.filter(
              (sessionId) =>
                (workingDirectoryEventVersionsRef.current.get(sessionId) ?? 0) !==
                eventVersionsBeforeQuery.get(sessionId)
            )
          )
          await enqueueTerminalWorkspaceSynchronization(
            workingDirectories.filter(({ sessionId }) => !supersededSessionIds.has(sessionId)),
            sessionIds.length === runningSessionIds.length && supersededSessionIds.size === 0
          )
        }
      } catch {
        // A working-directory observation is best effort and must not affect terminal readiness.
      } finally {
        isQuerying = false
      }
    }

    const unsubscribeWorkingDirectory =
      typeof api.onTerminalWorkingDirectoryChanged === 'function'
        ? api.onTerminalWorkingDirectoryChanged(
            (event: TerminalWorkingDirectoryChangedEvent): void => {
              if (!runningSessionIdSet.has(event.sessionId)) return
              workingDirectoryEventTimesRef.current.set(event.sessionId, Date.now())
              workingDirectoryEventVersionsRef.current.set(
                event.sessionId,
                (workingDirectoryEventVersionsRef.current.get(event.sessionId) ?? 0) + 1
              )
              pendingWorkingDirectoryEvents.set(event.sessionId, event)
              drainWorkingDirectoryEvents()
            }
          )
        : () => undefined
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'hidden') void synchronizeFallback()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void synchronizeFallback(true)
    const intervalId = window.setInterval(
      () => void synchronizeFallback(),
      terminalWorkspaceFallbackIntervalMs
    )

    return () => {
      isDisposed = true
      unsubscribeWorkingDirectory()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [
    currentWorkbench,
    currentWorkspaceId,
    findTerminalBlockIdForSession,
    moveTerminalSessionToWorkspace,
    projectDirectory,
    replaceWorkbench,
    runningSessionIds,
    runningSessionIdsKey
  ])
}

async function ensureTerminalBlockForMigratedSession({
  projectDirectory,
  sourceBlock,
  switchedWorkbench,
  workspaceId
}: {
  readonly projectDirectory: string
  readonly sourceBlock: TerminalBlockSnapshot | null
  readonly switchedWorkbench: WorkbenchSnapshot
  readonly workspaceId: string
}): Promise<{ readonly targetBlockId: string | null; readonly workbench: WorkbenchSnapshot }> {
  const api = window.cleancode

  if (!sourceBlock || switchedWorkbench.graph.blocks.some((block) => block.id === sourceBlock.id)) {
    return { targetBlockId: sourceBlock?.id ?? null, workbench: switchedWorkbench }
  }

  const createdGraph = await api?.createTerminalBlock({
    projectDirectory,
    workspaceId,
    name: sourceBlock.name,
    description: sourceBlock.description,
    position: sourceBlock.position
  })
  const createdBlock = createdGraph
    ? findCreatedTerminalBlock(switchedWorkbench.graph.blocks, createdGraph.blocks)
    : null

  if (!createdGraph || !createdBlock) {
    return { targetBlockId: sourceBlock.id, workbench: switchedWorkbench }
  }

  const resizedGraph = await api?.resizeTerminalBlock({
    projectDirectory,
    workspaceId,
    blockId: createdBlock.id,
    position: sourceBlock.position,
    size: sourceBlock.size
  })
  const definitionApi = window.cleancode
  if (typeof definitionApi?.updateTerminalDefinition !== 'function') {
    throw new Error('Terminal definition updates are unavailable.')
  }
  const updatedGraph = await definitionApi.updateTerminalDefinition({
    projectDirectory,
    workspaceId,
    blockId: createdBlock.id,
    name: sourceBlock.name,
    description: sourceBlock.description,
    launchCommand: sourceBlock.launchCommand,
    executionConfig: sourceBlock.executionConfig ?? defaultTerminalExecutionConfig
  })

  return {
    targetBlockId: createdBlock.id,
    workbench: {
      ...switchedWorkbench,
      graph: updatedGraph ?? resizedGraph ?? createdGraph
    }
  }
}

function findCreatedTerminalBlock(
  previousBlocks: readonly TerminalBlockSnapshot[],
  nextBlocks: readonly TerminalBlockSnapshot[]
): TerminalBlockSnapshot | null {
  const previousBlockIds = new Set(previousBlocks.map((block) => block.id))

  return nextBlocks.find((block) => !previousBlockIds.has(block.id)) ?? null
}

interface TerminalWorkingDirectoryEntry {
  readonly sessionId: string
  readonly workingDirectory: string
}

function rememberSuppressedWorkingDirectories(
  suppressedWorkingDirectories: Map<string, string>,
  workingDirectories: readonly TerminalWorkingDirectoryEntry[]
): void {
  for (const entry of workingDirectories) {
    suppressedWorkingDirectories.set(entry.sessionId, entry.workingDirectory)
  }
}

function forgetChangedSuppressedWorkingDirectories(
  suppressedWorkingDirectories: Map<string, string>,
  workingDirectories: readonly TerminalWorkingDirectoryEntry[]
): void {
  for (const entry of workingDirectories) {
    if (suppressedWorkingDirectories.get(entry.sessionId) !== entry.workingDirectory) {
      suppressedWorkingDirectories.delete(entry.sessionId)
    }
  }
}
