import { useCallback, type Dispatch, type SetStateAction } from 'react'

import type { WorkbenchSnapshot } from './types'
import { updateGraphViewportInWorkbench } from './updateGraphViewportInWorkbench'
import { putWorkbenchFirst } from './workbenchListUpdates'

export function useSingleTerminalBlockSelectionBridge(
  setSelectedTerminalBlockIds: Dispatch<SetStateAction<string[]>>,
  setSelectedTerminalGroupId: Dispatch<SetStateAction<string | null>>
) {
  return useCallback(
    (value: SetStateAction<string | null>): void => {
      if (value === null) setSelectedTerminalGroupId(null)
      setSelectedTerminalBlockIds((currentIds) => {
        const currentId = currentIds[0] ?? null
        const nextId = typeof value === 'function' ? value(currentId) : value
        return nextId ? [nextId] : []
      })
    },
    [setSelectedTerminalBlockIds, setSelectedTerminalGroupId]
  )
}

export function useWorkbenchListUpdates(
  setCurrentWorkbench: Dispatch<SetStateAction<WorkbenchSnapshot | null>>,
  setWorkbenches: Dispatch<SetStateAction<WorkbenchSnapshot[]>>
) {
  const rememberWorkbench = useCallback(
    (workbench: WorkbenchSnapshot): void => {
      setWorkbenches((entries) => putWorkbenchFirst(entries, workbench))
      setCurrentWorkbench(workbench)
    },
    [setCurrentWorkbench, setWorkbenches]
  )
  const replaceWorkbench = useCallback(
    (workbench: WorkbenchSnapshot): void => {
      setWorkbenches((entries) =>
        entries.map((entry) => (entry.project.id === workbench.project.id ? workbench : entry))
      )
      setCurrentWorkbench(workbench)
    },
    [setCurrentWorkbench, setWorkbenches]
  )
  return { rememberWorkbench, replaceWorkbench }
}

export function useAppShellGraphViewportUpdate(
  currentWorkbench: WorkbenchSnapshot | null,
  currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined,
  setCurrentGraph: (graph: WorkbenchSnapshot['graph']) => void
) {
  return useCallback(
    (viewport: WorkbenchSnapshot['graph']['viewport']) =>
      updateGraphViewportInWorkbench({
        currentWorkbench,
        currentWorkspace,
        viewport,
        setCurrentGraph
      }),
    [currentWorkbench, currentWorkspace, setCurrentGraph]
  )
}
