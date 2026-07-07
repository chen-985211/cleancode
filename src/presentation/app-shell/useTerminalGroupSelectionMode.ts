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
  const [isTerminalGroupSelectionMode, setIsTerminalGroupSelectionMode] = useState(false)
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

  useEffect(() => {
    if (isTerminalGroupSelectionMode && ungroupedTerminalBlockIds.length < 2) {
      setIsTerminalGroupSelectionMode(false)
    }
  }, [isTerminalGroupSelectionMode, ungroupedTerminalBlockIds.length])

  const beginTerminalGroupSelection = useCallback(() => {
    if (ungroupedTerminalBlockIds.length < 2) {
      return
    }

    setSelectedTerminalBlockIds([])
    setSelectedTerminalGroupId(null)
    setIsTerminalGroupSelectionMode(true)
  }, [setSelectedTerminalBlockIds, setSelectedTerminalGroupId, ungroupedTerminalBlockIds.length])

  const cancelTerminalGroupSelection = useCallback(() => {
    setIsTerminalGroupSelectionMode(false)
    setSelectedTerminalBlockIds([])
  }, [setSelectedTerminalBlockIds])

  const completeTerminalGroupSelection = useCallback(() => {
    setIsTerminalGroupSelectionMode(false)
    setSelectedTerminalBlockIds([])
  }, [setSelectedTerminalBlockIds])

  const selectTerminalBlock = useCallback(
    (blockId: string, shouldToggle: boolean) => {
      if (isTerminalGroupSelectionMode) {
        if (groupedTerminalBlockIds.has(blockId)) {
          return
        }

        setSelectedTerminalGroupId(null)
        setSelectedTerminalBlockIds((blockIds) => toggleTerminalSelection(blockIds, blockId, true))
        return
      }

      setSelectedTerminalBlockIds((blockIds) =>
        toggleTerminalSelection(blockIds, blockId, shouldToggle)
      )

      if (!shouldToggle) {
        setSelectedTerminalGroupId(null)
      }
    },
    [
      groupedTerminalBlockIds,
      isTerminalGroupSelectionMode,
      setSelectedTerminalBlockIds,
      setSelectedTerminalGroupId
    ]
  )

  const selectTerminalGroup = useCallback(
    (groupId: string) => {
      setIsTerminalGroupSelectionMode(false)
      setSelectedTerminalBlockIds([])
      setSelectedTerminalGroupId(groupId)
    },
    [setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )

  return {
    beginTerminalGroupSelection,
    cancelTerminalGroupSelection,
    completeTerminalGroupSelection,
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
