import type { ReactNode } from 'react'
import type { WorkspaceDefaults } from '../../application/dto/WorkspaceInitializationDetails'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import {
  WorkspaceDefaultsContents,
  type WorkspaceDefaultsCatalog
} from './WorkspaceDefaultsContents'
import './WorkspaceDefaults.css'

export interface WorkspaceDefaultsEditorProps extends WorkspaceDefaultsCatalog {
  readonly autosave: {
    readonly status: string
    readonly error: unknown
    readonly onChange: (value: WorkspaceDefaults) => void
    readonly onRetry: () => void
  }
  readonly recovery?: ReactNode
  readonly defaults: WorkspaceDefaults
}

export function WorkspaceDefaultsEditor({
  defaults,
  autosave,
  recovery,
  templates,
  providers
}: WorkspaceDefaultsEditorProps) {
  const { t } = useI18n()
  return (
    <form
      className="workspace-defaults-dialog"
      aria-label={t('workspaceDefaults.title')}
      aria-busy={autosave.status === 'saving'}
      onSubmit={(event) => event.preventDefault()}
    >
      {recovery}
      <fieldset className="workspace-defaults-fields">
        <WorkspaceDefaultsContents
          value={defaults}
          templates={templates}
          providers={providers}
          onChange={autosave.onChange}
        />
      </fieldset>
      {autosave.error ? (
        <div className="workspace-defaults-save-status" role="alert">
          <span className="workspace-defaults-error">{t('workspaceDefaults.saveFailed')}</span>
          <button type="button" onClick={autosave.onRetry}>
            {t('workspaceDefaults.retry')}
          </button>
        </div>
      ) : null}
    </form>
  )
}
