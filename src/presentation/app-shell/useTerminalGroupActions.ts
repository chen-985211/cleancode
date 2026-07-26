import { useCallback, useMemo } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  defaultTerminalDimensions,
  type TerminalDimensions,
  type TerminalGroupMetadataInput,
  type WorkbenchSnapshot
} from './types'
import type { TerminalSessionActionOptions } from './useTerminalSessions'

interface UseTerminalGroupActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly interruptTerminal: (block: TerminalBlockSnapshot) => Promise<void>
  readonly quickLaunchTerminal: (
    block: TerminalBlockSnapshot,
    options?: TerminalSessionActionOptions
  ) => Promise<void>
  readonly restartTerminal: (
    block: TerminalBlockSnapshot,
    options?: TerminalSessionActionOptions
  ) => Promise<void>
  readonly selectedTerminalBlockIds: readonly string[]
  readonly selectedUngroupedTerminalBlockIds: readonly string[]
  readonly setCurrentGraph: (graphSnapshot: WorkbenchSnapshot['graph']) => void
  readonly setSelectedTerminalBlockIds: (blockIds: string[]) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
  readonly startTerminal: (
    block: TerminalBlockSnapshot,
    dimensions: TerminalDimensions
  ) => Promise<unknown>
  readonly terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>
}

export function useTerminalGroupActions({
  currentWorkbench,
  currentWorkspace,
  interruptTerminal,
  quickLaunchTerminal,
  restartTerminal,
  selectedTerminalBlockIds,
  selectedUngroupedTerminalBlockIds,
  setCurrentGraph,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId,
  startTerminal,
  terminalBlocksById
}: UseTerminalGroupActionsInput) {
  const getGroupMemberBlocks = useCallback(
    (group: TerminalGroupSnapshot) =>
      group.memberBlockIds
        .map((blockId) => terminalBlocksById.get(blockId))
        .filter((block): block is TerminalBlockSnapshot => Boolean(block)),
    [terminalBlocksById]
  )
  const runGraphMutation = useCallback(
    async (
      mutate: (
        projectDirectory: string,
        workspaceId: string
      ) => Promise<WorkbenchSnapshot['graph'] | undefined>
    ) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      const graphSnapshot = await mutate(
        currentWorkbench.project.directory,
        currentWorkspace.workspaceId
      )

      if (graphSnapshot) {
        setCurrentGraph(graphSnapshot)
      }
    },
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )

  return useMemo(
    () => ({
      onStartGroup: (group: TerminalGroupSnapshot) => {
        for (const block of getGroupMemberBlocks(group)) {
          if (block.launchCommand.trim()) {
            void quickLaunchTerminal(block, { shouldFocus: false })
            continue
          }

          void startTerminal(block, defaultTerminalDimensions)
        }
      },
      onStopGroup: (group: TerminalGroupSnapshot) => {
        for (const block of getGroupMemberBlocks(group)) {
          void interruptTerminal(block)
        }
      },
      onRestartGroup: (group: TerminalGroupSnapshot) => {
        for (const block of getGroupMemberBlocks(group)) {
          void restartTerminal(block, { shouldFocus: false })
        }
      },
      onUpdateGroupMetadata: (group: TerminalGroupSnapshot, metadata: TerminalGroupMetadataInput) =>
        runGraphMutation(async (projectDirectory, workspaceId) =>
          window.cleancode?.updateTerminalGroupMetadata({
            projectDirectory,
            workspaceId,
            terminalGroupId: group.id,
            name: metadata.name
          })
        ),
      onToggleGroupCollapsed: (group: TerminalGroupSnapshot, isCollapsed: boolean) =>
        runGraphMutation(async (projectDirectory, workspaceId) =>
          window.cleancode?.setTerminalGroupCollapsed({
            projectDirectory,
            workspaceId,
            terminalGroupId: group.id,
            isCollapsed
          })
        ),
      onAddSelectedTerminalsToGroup: async (group: TerminalGroupSnapshot) => {
        await runGraphMutation(async (projectDirectory, workspaceId) => {
          let graphSnapshot: WorkbenchSnapshot['graph'] | undefined

          for (const blockId of selectedUngroupedTerminalBlockIds) {
            graphSnapshot = await window.cleancode?.addTerminalToGroup({
              projectDirectory,
              workspaceId,
              terminalGroupId: group.id,
              blockId
            })
          }

          return graphSnapshot
        })
        setSelectedTerminalBlockIds([])
      },
      onRemoveSelectedTerminalsFromGroup: async (group: TerminalGroupSnapshot) => {
        const selectedMemberBlockIds = selectedTerminalBlockIds.filter((blockId) =>
          group.memberBlockIds.includes(blockId)
        )

        await runGraphMutation(async (projectDirectory, workspaceId) => {
          let graphSnapshot: WorkbenchSnapshot['graph'] | undefined
          let remainingMemberCount = group.memberBlockIds.length

          for (const blockId of selectedMemberBlockIds) {
            graphSnapshot = await window.cleancode?.removeTerminalFromGroup({
              projectDirectory,
              workspaceId,
              terminalGroupId: group.id,
              blockId
            })
            remainingMemberCount -= 1

            if (remainingMemberCount < 2) {
              break
            }
          }

          return graphSnapshot
        })
        setSelectedTerminalBlockIds([])
      },
      onRemoveTerminalFromGroup: (group: TerminalGroupSnapshot, block: TerminalBlockSnapshot) =>
        runGraphMutation(async (projectDirectory, workspaceId) =>
          window.cleancode?.removeTerminalFromGroup({
            projectDirectory,
            workspaceId,
            terminalGroupId: group.id,
            blockId: block.id
          })
        ),
      onDissolveGroup: async (group: TerminalGroupSnapshot) => {
        await runGraphMutation(async (projectDirectory, workspaceId) =>
          window.cleancode?.dissolveTerminalGroup({
            projectDirectory,
            workspaceId,
            terminalGroupId: group.id
          })
        )
        setSelectedTerminalGroupId(null)
      }
    }),
    [
      getGroupMemberBlocks,
      interruptTerminal,
      quickLaunchTerminal,
      restartTerminal,
      runGraphMutation,
      selectedTerminalBlockIds,
      selectedUngroupedTerminalBlockIds,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId,
      startTerminal
    ]
  )
}
