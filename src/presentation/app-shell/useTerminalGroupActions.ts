import { useCallback, useMemo } from 'react'

import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalGroupMetadataInput, WorkbenchSnapshot } from './types'
import type { TerminalSessionActionOptions } from './useTerminalSessions'

interface UseTerminalGroupActionsInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly interruptTerminal: (block: TerminalBlockSnapshot) => Promise<void>
  readonly restartTerminal: (
    block: TerminalBlockSnapshot,
    options?: TerminalSessionActionOptions
  ) => Promise<void>
  readonly onEditGroup: (groupId: string) => void
  readonly setCurrentGraph: (graphSnapshot: WorkbenchSnapshot['graph']) => void
  readonly setSelectedTerminalGroupId: (groupId: string | null) => void
  readonly startTerminalCombination: (terminalGroupId: string) => Promise<void>
  readonly terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>
}

export function useTerminalGroupActions({
  currentWorkbench,
  currentWorkspace,
  interruptTerminal,
  restartTerminal,
  onEditGroup,
  setCurrentGraph,
  setSelectedTerminalGroupId,
  startTerminalCombination,
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
        void startTerminalCombination(group.id)
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
      onEditGroup: (group: TerminalGroupSnapshot) => onEditGroup(group.id),
      onRemoveTerminalFromGroup: (group: TerminalGroupSnapshot, block: TerminalBlockSnapshot) =>
        runGraphMutation(async (projectDirectory, workspaceId) =>
          window.cleancode?.moveTerminalWorkflowToGroup({
            projectDirectory,
            workspaceId,
            blockId: block.id,
            position: block.position,
            targetTerminalGroupId: null
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
      onEditGroup,
      restartTerminal,
      runGraphMutation,
      setSelectedTerminalGroupId,
      startTerminalCombination
    ]
  )
}
