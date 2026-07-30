import type { WorkbenchSnapshot } from './types'
import { BlockTemplateLibraryRoot } from './BlockTemplateLibraryRoot'
import { BlockTemplateSaveDialog } from './BlockTemplateSaveDialog'
import type { useBlockTemplateActions } from './useBlockTemplateActions'

export function BlockTemplateSurfaces({
  actions,
  currentWorkbench,
  currentWorkspace,
  isDesktopRuntime
}: {
  readonly actions: ReturnType<typeof useBlockTemplateActions>
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly currentWorkspace: WorkbenchSnapshot['project']['workspaces'][number] | undefined
  readonly isDesktopRuntime: boolean
}) {
  return (
    <>
      <BlockTemplateLibraryRoot
        currentProjectId={currentWorkbench?.project.id ?? null}
        isDesktopRuntime={isDesktopRuntime}
        onBeginPlacement={actions.beginPlacement}
      />
      {actions.saveBlockIds && currentWorkbench && currentWorkspace ? (
        <BlockTemplateSaveDialog
          graph={currentWorkbench.graph}
          projectDirectory={currentWorkbench.project.directory}
          selectedBlockIds={actions.saveBlockIds}
          workspaceId={currentWorkspace.workspaceId}
          onCancel={actions.closeSave}
          onSaved={actions.closeSave}
        />
      ) : null}
    </>
  )
}
