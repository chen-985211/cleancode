import { useMemo } from 'react'

import type {
  CanvasPanDirection,
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
  readonly panCanvas: (direction: CanvasPanDirection) => void
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
  panCanvas,
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
      panCanvasLeft: { enabled: hasWorkbench, run: () => panCanvas('left') },
      panCanvasRight: { enabled: hasWorkbench, run: () => panCanvas('right') },
      panCanvasUp: { enabled: hasWorkbench, run: () => panCanvas('up') },
      panCanvasDown: { enabled: hasWorkbench, run: () => panCanvas('down') },
      zoomCanvasIn: { enabled: hasWorkbench, run: zoomCanvasIn },
      zoomCanvasOut: { enabled: hasWorkbench, run: zoomCanvasOut },
      fitCanvas: { enabled: hasWorkbench, run: fitCanvas },
      toggleMinimap: { enabled: hasWorkbench, run: toggleMinimap }
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
      panCanvas,
      toggleMinimap,
      toggleSidebar,
      zoomCanvasIn,
      zoomCanvasOut
    ]
  )
}
