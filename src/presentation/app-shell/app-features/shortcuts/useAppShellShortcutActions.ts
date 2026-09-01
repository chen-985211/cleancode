import { useMemo } from 'react'

import type {
  CanvasNavigationDirection,
  WorkspaceNavigationDirection
} from './applicationShortcutNavigation'
import type { ApplicationShortcutActions } from './useApplicationShortcuts'

type ShortcutRun = () => void | Promise<void>

interface UseAppShellShortcutActionsInput {
  readonly addProject: ShortcutRun
  readonly createAgent: ShortcutRun
  readonly createBranchWorkspace: ShortcutRun
  readonly createTerminal: ShortcutRun
  readonly fitCanvas: ShortcutRun
  readonly groupTerminals: ShortcutRun
  readonly hasMultipleWorkspaces: boolean
  readonly hasWorkbench: boolean
  readonly isDesktopRuntime: boolean
  readonly isGroupSelectionMode: boolean
  readonly isSettingsOpen: boolean
  readonly navigateWorkspace: (direction: WorkspaceNavigationDirection) => void | Promise<void>
  readonly openSettings: ShortcutRun
  readonly executeQuickExecutionSlot: (number: 1 | 2 | 3 | 4 | 5) => void | Promise<void>
  readonly selectCanvasNode: (direction: CanvasNavigationDirection) => void
  readonly toggleMinimap: ShortcutRun
  readonly toggleSidebar: ShortcutRun
  readonly zoomCanvasIn: ShortcutRun
  readonly zoomCanvasOut: ShortcutRun
}

export function useAppShellShortcutActions({
  addProject,
  createAgent,
  createBranchWorkspace,
  createTerminal,
  fitCanvas,
  groupTerminals,
  hasMultipleWorkspaces,
  hasWorkbench,
  isDesktopRuntime,
  isGroupSelectionMode,
  isSettingsOpen,
  navigateWorkspace,
  openSettings,
  executeQuickExecutionSlot,
  selectCanvasNode,
  toggleMinimap,
  toggleSidebar,
  zoomCanvasIn,
  zoomCanvasOut
}: UseAppShellShortcutActionsInput): ApplicationShortcutActions {
  return useMemo(
    () => ({
      openSettings: { enabled: !isSettingsOpen, run: openSettings },
      toggleSidebar: { enabled: true, run: toggleSidebar },
      addProject: { enabled: isDesktopRuntime, run: addProject },
      createBranchWorkspace: {
        enabled: isDesktopRuntime && hasWorkbench,
        run: createBranchWorkspace
      },
      previousWorkspace: {
        enabled: isDesktopRuntime && hasMultipleWorkspaces,
        run: () => navigateWorkspace('previous')
      },
      nextWorkspace: {
        enabled: isDesktopRuntime && hasMultipleWorkspaces,
        run: () => navigateWorkspace('next')
      },
      createTerminal: { enabled: isDesktopRuntime && hasWorkbench, run: createTerminal },
      createAgent: { enabled: isDesktopRuntime && hasWorkbench, run: createAgent },
      groupTerminals: {
        enabled: isDesktopRuntime && hasWorkbench && !isGroupSelectionMode,
        run: groupTerminals
      },
      selectCanvasNodeLeft: {
        enabled: hasWorkbench,
        run: () => selectCanvasNode('left')
      },
      selectCanvasNodeRight: {
        enabled: hasWorkbench,
        run: () => selectCanvasNode('right')
      },
      selectCanvasNodeUp: {
        enabled: hasWorkbench,
        run: () => selectCanvasNode('up')
      },
      selectCanvasNodeDown: {
        enabled: hasWorkbench,
        run: () => selectCanvasNode('down')
      },
      zoomCanvasIn: { enabled: hasWorkbench, run: zoomCanvasIn },
      zoomCanvasOut: { enabled: hasWorkbench, run: zoomCanvasOut },
      fitCanvas: { enabled: hasWorkbench, run: fitCanvas },
      toggleMinimap: { enabled: hasWorkbench, run: toggleMinimap },
      quickExecution1: { enabled: hasWorkbench, run: () => executeQuickExecutionSlot(1) },
      quickExecution2: { enabled: hasWorkbench, run: () => executeQuickExecutionSlot(2) },
      quickExecution3: { enabled: hasWorkbench, run: () => executeQuickExecutionSlot(3) },
      quickExecution4: { enabled: hasWorkbench, run: () => executeQuickExecutionSlot(4) },
      quickExecution5: { enabled: hasWorkbench, run: () => executeQuickExecutionSlot(5) }
    }),
    [
      addProject,
      createAgent,
      createBranchWorkspace,
      createTerminal,
      fitCanvas,
      groupTerminals,
      hasMultipleWorkspaces,
      hasWorkbench,
      isDesktopRuntime,
      isGroupSelectionMode,
      isSettingsOpen,
      navigateWorkspace,
      openSettings,
      executeQuickExecutionSlot,
      selectCanvasNode,
      toggleMinimap,
      toggleSidebar,
      zoomCanvasIn,
      zoomCanvasOut
    ]
  )
}
