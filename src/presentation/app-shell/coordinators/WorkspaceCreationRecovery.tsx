import { useState } from 'react'
import type { WorkspaceInitializationSnapshot } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'
import { useI18n } from '../../i18n/useI18n'
import { resolveUserFacingErrorMessage } from '../../shared/errors/appErrorMessages'

export function WorkspaceCreationRecovery({
  operations,
  onResume,
  onCancel
}: {
  readonly operations: readonly WorkspaceInitializationSnapshot[]
  readonly onResume: (operation: WorkspaceInitializationSnapshot) => Promise<void>
  readonly onCancel: (operation: WorkspaceInitializationSnapshot) => Promise<void>
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<readonly string[]>([])
  const [error, setError] = useState<unknown>(null)
  const unfinished = operations.filter(
    (item) =>
      item.mode === 'new-workspace' &&
      item.stage !== 'complete' &&
      item.stage !== 'cancelled' &&
      !dismissed.includes(item.id)
  )
  if (!unfinished.length) return null
  async function run(operation: WorkspaceInitializationSnapshot, cancel: boolean) {
    if (pending) return
    setPending(operation.id)
    setError(null)
    try {
      await (cancel ? onCancel(operation) : onResume(operation))
      setDismissed((current) => [...current, operation.id])
    } catch (failure) {
      setError(failure)
    } finally {
      setPending(null)
    }
  }
  return (
    <section
      className="workspace-creation-recovery"
      aria-label={t('workspaceInitialization.recovery')}
    >
      <strong>{t('workspaceInitialization.recovery')}</strong>
      {unfinished.map((operation) => (
        <div className="workspace-initialization-item" key={operation.id}>
          <span>{operation.branchName}</span>
          <div className="workspace-initialization-actions">
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => {
                void run(operation, false)
              }}
            >
              {t('workspaceInitialization.retry', { name: operation.branchName ?? '' })}
            </button>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => {
                void run(operation, true)
              }}
            >
              {t('workspaceInitialization.skip', { name: operation.branchName ?? '' })}
            </button>
          </div>
        </div>
      ))}
      {error ? (
        <p className="workspace-defaults-error" role="alert">
          {resolveUserFacingErrorMessage(error, 'workspaceDefaults.failed', t)}
        </p>
      ) : null}
    </section>
  )
}
