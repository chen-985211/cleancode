import type { WorkbenchSnapshot } from './types'
import { BlockTemplateLibraryRoot } from './BlockTemplateLibraryRoot'
import { BlockTemplateSaveDialog } from './BlockTemplateSaveDialog'
import type { useBlockTemplateActions } from './useBlockTemplateActions'

export function BlockTemplateSurfaces({
  actions,
  currentWorkbench,
  isDesktopRuntime
}: {
  readonly actions: ReturnType<typeof useBlockTemplateActions>
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isDesktopRuntime: boolean
}) {
  const savePresentation = actions.savePresentation

  return (
    <>
      <BlockTemplateLibraryRoot
        currentProjectId={currentWorkbench?.project.id ?? null}
        isDesktopRuntime={isDesktopRuntime}
        onBeginPlacement={actions.beginPlacement}
      />
      {savePresentation ? (
        <BlockTemplateSaveDialog
          {...savePresentation}
          onCancel={actions.closeSave}
          onExitComplete={actions.completeSaveExit}
          onSaved={actions.closeSave}
        />
      ) : null}
    </>
  )
}
