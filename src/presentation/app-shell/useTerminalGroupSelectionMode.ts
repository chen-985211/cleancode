import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react'
import type { WorkbenchSnapshot } from './types'

interface UseTerminalGroupSelectionModeInput {
  readonly graph: WorkbenchSnapshot['graph'] | null
  readonly selectedTerminalBlockIds: readonly string[]
  readonly setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>
  readonly setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
}

export function useTerminalGroupSelectionMode({
  graph,
  selectedTerminalBlockIds,
  setSelectedTerminalBlockIds,
  setSelectedTerminalGroupId
}: UseTerminalGroupSelectionModeInput) {
  const [editingTerminalGroupId, setEditingTerminalGroupId] = useState<string | null>(null)
  const groupedTerminalBlockIds = useMemo(
    () => new Set((graph?.terminalGroups ?? []).flatMap((group) => group.memberBlockIds)),
    [graph]
  )
  const ungroupedTerminalBlockIds = useMemo(
    () => (graph?.blocks ?? []).filter((block) => !groupedTerminalBlockIds.has(block.id)),
    [graph, groupedTerminalBlockIds]
  )
  const selectedUngroupedTerminalBlockIds = useMemo(
    () => selectedTerminalBlockIds.filter((blockId) => !groupedTerminalBlockIds.has(blockId)),
    [groupedTerminalBlockIds, selectedTerminalBlockIds]
  )
  const isTerminalGroupSelectionMode = editingTerminalGroupId !== null
  const canCreateTerminalGroup = editingTerminalGroupId === null

  useEffect(() => {
    if (
      editingTerminalGroupId &&
      !graph?.terminalGroups.some((group) => group.id === editingTerminalGroupId)
    ) {
      setEditingTerminalGroupId(null)
    }
  }, [editingTerminalGroupId, graph])

  const beginTerminalGroupSelection = useCallback(
    (groupId: string) => {
      setSelectedTerminalGroupId(groupId)
      setSelectedTerminalBlockIds([])
      setEditingTerminalGroupId(groupId)
    },
    [setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )

  const cancelTerminalGroupSelection = useCallback(() => {
    setEditingTerminalGroupId(null)
    setSelectedTerminalBlockIds([])
  }, [setSelectedTerminalBlockIds])

  const completeTerminalGroupSelection = useCallback(() => {
    setEditingTerminalGroupId(null)
    setSelectedTerminalBlockIds([])
  }, [setSelectedTerminalBlockIds])

  const selectTerminalBlock = useCallback(
    (blockId: string, shouldToggle: boolean) => {
      setSelectedTerminalBlockIds((blockIds) =>
        toggleTerminalSelection(blockIds, blockId, shouldToggle)
      )

      if (!shouldToggle) {
        setSelectedTerminalGroupId(null)
      }
    },
    [setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )

  const selectTerminalGroup = useCallback(
    (groupId: string) => {
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(groupId)
    },
    [setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )

  return {
    beginTerminalGroupSelection,
    canCreateTerminalGroup,
    cancelTerminalGroupSelection,
    completeTerminalGroupSelection,
    editingTerminalGroupId,
    isTerminalGroupSelectionMode,
    selectTerminalBlock,
    selectTerminalGroup,
    selectedUngroupedTerminalBlockIds,
    ungroupedTerminalBlockCount: ungroupedTerminalBlockIds.length
  }
}

function toggleTerminalSelection(
  currentBlockIds: string[],
  blockId: string,
  shouldToggle: boolean
): string[] {
  if (!shouldToggle) {
    if (currentBlockIds.length === 1 && currentBlockIds[0] === blockId) {
      return currentBlockIds
    }

    return [blockId]
  }

  return currentBlockIds.includes(blockId)
    ? currentBlockIds.filter((currentBlockId) => currentBlockId !== blockId)
    : [...currentBlockIds, blockId]
}
