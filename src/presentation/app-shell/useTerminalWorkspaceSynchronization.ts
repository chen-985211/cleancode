import { useEffect, useRef } from 'react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { findWorkspaceByDirectory } from './workspaceDirectoryMatching'
import type { WorkbenchSnapshot } from './types'

const terminalWorkspaceSynchronizationIntervalMs = 1500
export const manualWorkspaceSelectionBrowserEventName = 'cleancode-manual-workspace-selection'

interface UseTerminalWorkspaceSynchronizationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly findTerminalBlockIdForSession: (sessionId: string) => string | null
  readonly moveTerminalSessionToWorkspace: (
    sessionId: string,
    targetWorkspaceName: string,
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
  const currentWorkspaceName =
    currentWorkbench?.project.workspaces.find((workspace) => workspace.isCurrent)?.name ?? null
  const manualWorkspaceSelectionRevisionRef = useRef(0)
  const observedManualWorkspaceSelectionRevisionRef = useRef(0)
  const suppressedWorkingDirectoriesRef = useRef<Map<string, string>>(new Map())

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
    let isSynchronizing = false

    const synchronizeTerminalWorkspace = async (): Promise<void> => {
      if (isSynchronizing) {
        return
      }

      isSynchronizing = true

      try {
        const workingDirectories = await api.listTerminalWorkingDirectories({
          sessionIds: runningSessionIds
        })
        forgetChangedSuppressedWorkingDirectories(
          suppressedWorkingDirectoriesRef.current,
          workingDirectories
        )

        if (
          manualWorkspaceSelectionRevisionRef.current !==
          observedManualWorkspaceSelectionRevisionRef.current
        ) {
          observedManualWorkspaceSelectionRevisionRef.current =
            manualWorkspaceSelectionRevisionRef.current
          rememberSuppressedWorkingDirectories(
            suppressedWorkingDirectoriesRef.current,
            workingDirectories
          )
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
          .find(({ workspace }) => workspace && workspace.name !== currentWorkspace.name)

        if (!matchedTerminalWorkspace?.workspace || isDisposed) {
          return
        }

        const { entry, workspace } = matchedTerminalWorkspace

        const sourceBlockId = findTerminalBlockIdForSession(entry.sessionId)
        const sourceBlock =
          currentWorkbench.graph.blocks.find((block) => block.id === sourceBlockId) ?? null

        const switchedWorkbench = await api.switchBranchWorkspace({
          projectDirectory,
          workspaceName: workspace.name
        })
        const ensured = await ensureTerminalBlockForMigratedSession({
          projectDirectory,
          sourceBlock,
          switchedWorkbench,
          workspaceName: workspace.name
        })

        moveTerminalSessionToWorkspace(
          entry.sessionId,
          workspace.name,
          ensured.targetBlockId ?? undefined
        )

        if (!isDisposed) {
          replaceWorkbench(ensured.workbench)
        }
      } catch {
        // Keep the last visible workspace if terminal cwd inspection or switching fails.
      } finally {
        isSynchronizing = false
      }
    }

    void synchronizeTerminalWorkspace()
    const intervalId = window.setInterval(
      () => void synchronizeTerminalWorkspace(),
      terminalWorkspaceSynchronizationIntervalMs
    )

    return () => {
      isDisposed = true
      window.clearInterval(intervalId)
    }
  }, [
    currentWorkbench,
    currentWorkspaceName,
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
  workspaceName
}: {
  readonly projectDirectory: string
  readonly sourceBlock: TerminalBlockSnapshot | null
  readonly switchedWorkbench: WorkbenchSnapshot
  readonly workspaceName: string
}): Promise<{ readonly targetBlockId: string | null; readonly workbench: WorkbenchSnapshot }> {
  const api = window.cleancode

  if (!sourceBlock || switchedWorkbench.graph.blocks.some((block) => block.id === sourceBlock.id)) {
    return { targetBlockId: sourceBlock?.id ?? null, workbench: switchedWorkbench }
  }

  const createdGraph = await api?.createTerminalBlock({
    projectDirectory,
    workspaceName,
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
    workspaceName,
    blockId: createdBlock.id,
    position: sourceBlock.position,
    size: sourceBlock.size
  })
  const updatedGraph = await api?.updateTerminalBlockMetadata({
    projectDirectory,
    workspaceName,
    blockId: createdBlock.id,
    name: sourceBlock.name,
    description: sourceBlock.description,
    launchCommand: sourceBlock.launchCommand
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
