import type { WorkbenchSnapshot } from './types/workbenchSnapshot'
import { BlockTemplateLibraryRoot } from '../../contexts/block-graph/presentation/components/BlockTemplateLibraryRoot'
import { BlockTemplateSaveDialog } from '../../contexts/block-graph/presentation/components/BlockTemplateSaveDialog'
import type { BlockTemplateLibraryActions } from '../../contexts/block-graph/presentation/view-models/BlockTemplatePresentationActions'
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
  const runtime = isDesktopRuntime ? window.cleancode : undefined
  const libraryActions: BlockTemplateLibraryActions | null = runtime
    ? {
        deleteTemplate: runtime.deleteBlockTemplate,
        listTemplates: runtime.listBlockTemplates,
        moveTemplate: runtime.moveBlockTemplate,
        updateTemplate: runtime.updateBlockTemplate
      }
    : null

  return (
    <>
      <BlockTemplateLibraryRoot
        actions={libraryActions}
        currentProjectId={currentWorkbench?.project.id ?? null}
        onBeginPlacement={actions.beginPlacement}
      />
      {savePresentation ? (
        <BlockTemplateSaveDialog
          {...savePresentation}
          onCancel={actions.closeSave}
          onExitComplete={actions.completeSaveExit}
          onSave={async (command) => runtime?.saveBlockTemplate(command)}
          onSaved={actions.closeSave}
        />
      ) : null}
    </>
  )
}
