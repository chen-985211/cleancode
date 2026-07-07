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

interface UseTerminalGroupActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly interruptTerminal: (block: TerminalBlockSnapshot) => Promise<void>
  readonly restartTerminal: (block: TerminalBlockSnapshot) => Promise<void>
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
        workspaceName: string
      ) => Promise<WorkbenchSnapshot['graph'] | undefined>
    ) => {
      if (!currentWorkbench || !currentWorkspace) {
        return
      }

      const graphSnapshot = await mutate(currentWorkbench.project.directory, currentWorkspace.name)

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
          void restartTerminal(block)
        }
      },
      onUpdateGroupMetadata: (group: TerminalGroupSnapshot, metadata: TerminalGroupMetadataInput) =>
        runGraphMutation(async (projectDirectory, workspaceName) =>
          window.cleancode?.updateTerminalGroupMetadata({
            projectDirectory,
            workspaceName,
            terminalGroupId: group.id,
            name: metadata.name
          })
        ),
      onToggleGroupCollapsed: (group: TerminalGroupSnapshot, isCollapsed: boolean) =>
        runGraphMutation(async (projectDirectory, workspaceName) =>
          window.cleancode?.setTerminalGroupCollapsed({
            projectDirectory,
            workspaceName,
            terminalGroupId: group.id,
            isCollapsed
          })
        ),
      onAddSelectedTerminalsToGroup: async (group: TerminalGroupSnapshot) => {
        await runGraphMutation(async (projectDirectory, workspaceName) => {
          let graphSnapshot: WorkbenchSnapshot['graph'] | undefined

          for (const blockId of selectedUngroupedTerminalBlockIds) {
            graphSnapshot = await window.cleancode?.addTerminalToGroup({
              projectDirectory,
              workspaceName,
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

        await runGraphMutation(async (projectDirectory, workspaceName) => {
          let graphSnapshot: WorkbenchSnapshot['graph'] | undefined
          let remainingMemberCount = group.memberBlockIds.length

          for (const blockId of selectedMemberBlockIds) {
            graphSnapshot = await window.cleancode?.removeTerminalFromGroup({
              projectDirectory,
              workspaceName,
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
        runGraphMutation(async (projectDirectory, workspaceName) =>
          window.cleancode?.removeTerminalFromGroup({
            projectDirectory,
            workspaceName,
            terminalGroupId: group.id,
            blockId: block.id
          })
        ),
      onDissolveGroup: async (group: TerminalGroupSnapshot) => {
        await runGraphMutation(async (projectDirectory, workspaceName) =>
          window.cleancode?.dissolveTerminalGroup({
            projectDirectory,
            workspaceName,
            terminalGroupId: group.id
          })
        )
        setSelectedTerminalGroupId(null)
      }
    }),
    [
      getGroupMemberBlocks,
      interruptTerminal,
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
