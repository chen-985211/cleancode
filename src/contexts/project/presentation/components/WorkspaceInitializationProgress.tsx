import type { WorkspaceInitializationSnapshot } from '../../application/dto/WorkspaceInitializationDetails'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { resolveUserFacingErrorMessage } from '../../../../presentation/shared/errors/appErrorMessages'

export function WorkspaceInitializationProgress({
  initialization,
  pending,
  error,
  onApply
}: {
  readonly initialization: WorkspaceInitializationSnapshot
  readonly pending: boolean
  readonly error: unknown
  readonly onApply: (action?: {
    readonly retryItemId?: string
    readonly skipItemId?: string
  }) => void
}) {
  const { t } = useI18n()
  const unresolved = initialization.items.some(
    (item) =>
      item.status === 'pending' ||
      item.status === 'failed' ||
      item.runStatus === 'uncertain' ||
      item.runStatus === 'failed'
  )
  if (!unresolved && !pending && !error) return null
  if (initialization.stage === 'cancelled') return null
  return (
    <div className="workspace-initialization-panel" aria-busy={pending}>
      <details
        open={
          Boolean(error) ||
          initialization.items.some(
            (item) =>
              item.status === 'failed' ||
              item.runStatus === 'uncertain' ||
              item.runStatus === 'failed'
          )
        }
      >
        <summary>
          {t(
            pending
              ? 'workspaceInitialization.applying'
              : initialization.stage === 'complete'
                ? 'workspaceInitialization.title'
                : 'workspaceInitialization.pending'
          )}
        </summary>
        {initialization.items.map((item) => (
          <div className="workspace-initialization-item" key={item.id}>
            <strong>{item.name}</strong>
            <p>
              {t(
                item.status === 'created'
                  ? 'workspaceInitialization.created'
                  : item.status === 'failed'
                    ? 'workspaceInitialization.failed'
                    : item.status === 'skipped'
                      ? 'workspaceInitialization.skipped'
                      : 'workspaceInitialization.waiting'
              )}
            </p>
            {item.errorCode ? (
              <p>
                {resolveUserFacingErrorMessage(
                  { code: item.errorCode, message: '', isExpected: true },
                  'workspaceDefaults.failed',
                  t
                )}
              </p>
            ) : null}
            {item.runStatus === 'uncertain' ? (
              <p>{t('workspaceInitialization.uncertain')}</p>
            ) : null}
            {item.runStatus === 'failed' ? <p>{t('workspaceInitialization.runFailed')}</p> : null}
            <div className="workspace-initialization-actions">
              {item.status === 'failed' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onApply({ retryItemId: item.id })}
                >
                  {t('workspaceInitialization.retry', { name: item.name })}
                </button>
              ) : null}
              {item.status === 'pending' ||
              item.status === 'failed' ||
              item.runStatus === 'uncertain' ||
              item.runStatus === 'failed' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onApply({ skipItemId: item.id })}
                >
                  {t('workspaceInitialization.skip', { name: item.name })}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </details>
      {error ? (
        <p className="workspace-defaults-error" role="alert">
          {resolveUserFacingErrorMessage(error, 'workspaceDefaults.failed', t)}
        </p>
      ) : null}
      {initialization.items.some((item) => item.status === 'pending') ? (
        <div className="workspace-initialization-actions">
          <button type="button" disabled={pending} onClick={() => onApply()}>
            {t('workspaceInitialization.continue')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
