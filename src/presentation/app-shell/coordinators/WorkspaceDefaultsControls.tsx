import { AgentProviderIcon } from '../../../contexts/agent/presentation/components/AgentProviderIcon'
import type { WorkspaceDefaultsAutosave } from './WorkspaceDefaultsAutosave'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { WorkspaceCreationRecovery } from './WorkspaceCreationRecovery'
import type { WorkspaceInitializationSnapshot } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import {
  WorkspaceDefaultsEditor,
  type WorkspaceDefaultsEditorProps
} from '../../../contexts/project/presentation/components/WorkspaceDefaultsEditor'
import { useI18n } from '../../i18n/useI18n'
import { resolveUserFacingErrorMessage } from '../../shared/errors/appErrorMessages'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

export function WorkspaceDefaultsDialogLoader({
  workbench,
  onResume,
  onCancel,
  autosaveStore
}: {
  readonly autosaveStore: WorkspaceDefaultsAutosave
  readonly workbench: WorkbenchSnapshot
  readonly onResume: (operation: WorkspaceInitializationSnapshot) => Promise<void>
  readonly onCancel: (operation: WorkspaceInitializationSnapshot) => Promise<void>
}) {
  const { t } = useI18n()
  const [data, setData] = useState<Pick<
    WorkspaceDefaultsEditorProps,
    'defaults' | 'templates' | 'providers'
  > | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const [operations, setOperations] = useState<readonly WorkspaceInitializationSnapshot[]>([])
  const directory = workbench.project.directory,
    projectId = workbench.project.id
  useEffect(() => {
    const api = window.cleancode
    if (!api) return
    let cancelled = false
    void Promise.all([
      api.getWorkspaceDefaults({ projectDirectory: directory }),
      api.listBlockTemplates({ scope: { type: 'project', projectId } }),
      api.listBlockTemplates({ scope: { type: 'global' } }),
      api.discoverCreatableAgentProviders(),
      api.getAgentProviderPreferences(),
      api.listWorkspaceInitializations({ projectDirectory: directory })
    ])
      .then(
        ([
          defaults,
          projectTemplates,
          globalTemplates,
          providers,
          preferences,
          initializations
        ]) => {
          if (!cancelled) autosaveStore.seed(directory, defaults)
          if (!cancelled) setOperations(initializations.map((item) => item.initialization))
          if (!cancelled)
            setData({
              defaults: autosaveStore.get(directory)?.value ?? defaults,
              templates: [
                ...projectTemplates.map((item) => ({ ...item, source: 'project' as const })),
                ...globalTemplates.map((item) => ({ ...item, source: 'global' as const }))
              ],
              providers: providers
                .filter(
                  (provider) => !preferences.disabledProviderIds.includes(provider.descriptor.id)
                )
                .map((provider) => ({
                  id: provider.descriptor.id,
                  name: provider.descriptor.displayName,
                  icon: <AgentProviderIcon icon={provider.descriptor.icon} />
                }))
            })
        }
      )
      .catch((failure) => {
        if (!cancelled) setError(failure)
      })
    return () => {
      cancelled = true
    }
  }, [attempt, autosaveStore, directory, projectId])
  if (data)
    return (
      <LoadedEditor
        autosaveStore={autosaveStore}
        directory={directory}
        {...data}
        recovery={
          <WorkspaceCreationRecovery
            operations={operations}
            onResume={onResume}
            onCancel={onCancel}
          />
        }
      />
    )
  return (
    <div className="workspace-defaults-dialog">
      <p role={error ? 'alert' : 'status'}>
        {error
          ? resolveUserFacingErrorMessage(error, 'workspaceDefaults.failed', t)
          : t('workspaceDefaults.loading')}
      </p>
      <footer>
        {error ? (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setAttempt((value) => value + 1)
            }}
          >
            {t('workspaceDefaults.retry')}
          </button>
        ) : null}
      </footer>
    </div>
  )
}

function LoadedEditor({
  autosaveStore,
  directory,
  ...props
}: Omit<WorkspaceDefaultsEditorProps, 'autosave'> & {
  readonly autosaveStore: WorkspaceDefaultsAutosave
  readonly directory: string
}) {
  const state = useSyncExternalStore(autosaveStore.subscribe, () => autosaveStore.get(directory))
  return (
    <WorkspaceDefaultsEditor
      {...props}
      defaults={state?.value ?? props.defaults}
      autosave={{
        status: state?.status ?? 'idle',
        error: state?.error ?? null,
        onChange: (value) => autosaveStore.edit(directory, value),
        onRetry: () => {
          void autosaveStore.retry(directory).catch(() => undefined)
        }
      }}
    />
  )
}
