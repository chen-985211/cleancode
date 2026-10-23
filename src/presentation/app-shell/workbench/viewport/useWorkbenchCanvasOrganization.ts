import { defaultApplicationShortcutBindings } from '../../app-features/shortcuts/applicationShortcuts'
import { useApplicationShortcuts } from '../../app-features/shortcuts/useApplicationShortcuts'
import type { WorkbenchCanvasProps } from '../workbenchCanvasProps'
import { useCanvasOrganization } from './useCanvasOrganization'

type OrganizationInput = Pick<
  WorkbenchCanvasProps,
  | 'currentWorkbench'
  | 'currentWorkspace'
  | 'editingTerminalGroupId'
  | 'isDesktopRuntime'
  | 'isCanvasArrangementPending'
  | 'isTerminalGroupSelectionMode'
  | 'placementTemplate'
  | 'shortcutBindings'
  | 'shortcutPlatform'
  | 'onOrganizeCanvas'
  | 'reactFlowInstanceRef'
> &
  Pick<Parameters<typeof useCanvasOrganization>[0], 'items' | 'onUserAction' | 'onFailure'>

export function useWorkbenchCanvasOrganization({
  currentWorkbench,
  currentWorkspace,
  editingTerminalGroupId,
  isDesktopRuntime,
  isCanvasArrangementPending,
  isTerminalGroupSelectionMode,
  placementTemplate,
  shortcutBindings = defaultApplicationShortcutBindings,
  shortcutPlatform = 'mac',
  ...organizationInput
}: OrganizationInput) {
  const canOrganizeCanvas =
    isDesktopRuntime &&
    Boolean(currentWorkbench) &&
    Boolean(organizationInput.onOrganizeCanvas) &&
    organizationInput.items.length > 0 &&
    !isCanvasArrangementPending &&
    !isTerminalGroupSelectionMode &&
    !editingTerminalGroupId &&
    !placementTemplate
  const organization = useCanvasOrganization({
    ...organizationInput,
    scopeKey: JSON.stringify([
      currentWorkbench?.project.id,
      currentWorkspace?.workspaceId,
      currentWorkbench?.graph.id
    ])
  })
  useApplicationShortcuts({
    actions: { organizeCanvas: { enabled: canOrganizeCanvas, run: organization.organize } },
    bindings: shortcutBindings,
    platform: shortcutPlatform
  })
  return { ...organization, canOrganizeCanvas }
}
