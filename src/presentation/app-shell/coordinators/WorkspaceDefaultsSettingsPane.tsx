import type { WorkspaceDefaultsAutosave } from './WorkspaceDefaultsAutosave'
import { useState } from 'react'
import { WorkspaceDefaultsProjectPicker } from '../../../contexts/project/presentation/components/WorkspaceDefaultsProjectPicker'
import type { WorkspaceInitializationSnapshot } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import { WorkspaceDefaultsDialogLoader } from './WorkspaceDefaultsControls'
import { useI18n } from '../../i18n/useI18n'

export function WorkspaceDefaultsSettingsPane({
  autosaveStore,
  workbenches,
  currentProjectId,
  onResume,
  onCancel
}: {
  readonly autosaveStore: WorkspaceDefaultsAutosave
  readonly workbenches: readonly WorkbenchSnapshot[]
  readonly currentProjectId?: string
  readonly onResume: (
    workbench: WorkbenchSnapshot,
    operation: WorkspaceInitializationSnapshot
  ) => Promise<void>
  readonly onCancel: (operation: WorkspaceInitializationSnapshot) => Promise<void>
}) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(currentProjectId)
  const selected = workbenches.find((item) => item.project.id === selectedId) ?? workbenches[0]
  return (
    <div className="workspace-defaults-settings-pane">
      <header className="workspace-defaults-settings-header">
        <div className="workspace-defaults-settings-heading">
          <h2>{t('settings.workspace.title')}</h2>
          {selected && window.cleancode?.getWorkspaceDefaults ? (
            <WorkspaceDefaultsProjectPicker
              projects={workbenches.map((workbench) => workbench.project)}
              selected={selected.project}
              onSelect={setSelectedId}
            />
          ) : null}
        </div>
        {selected ? (
          <p className="workspace-defaults-description">{t('workspaceDefaults.description')}</p>
        ) : null}
      </header>
      {selected && window.cleancode?.getWorkspaceDefaults ? (
        <>
          <WorkspaceDefaultsDialogLoader
            key={selected.project.id}
            autosaveStore={autosaveStore}
            workbench={selected}
            onResume={(operation) => onResume(selected, operation)}
            onCancel={onCancel}
          />
        </>
      ) : (
        <p className="workspace-defaults-description">{t('workspaceDefaults.noProjects')}</p>
      )}
    </div>
  )
}
