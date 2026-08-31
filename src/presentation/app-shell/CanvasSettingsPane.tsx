import { useI18n } from '../i18n/useI18n'
import { ApplicationSettingsSwitch } from '../shared/components/ApplicationSettingsSwitch'

export function CanvasSettingsPane({
  followQuickExecutionTarget,
  onFollowQuickExecutionTargetChange,
  reduceVisualNoise,
  onReduceVisualNoiseChange
}: {
  readonly followQuickExecutionTarget: boolean
  readonly onFollowQuickExecutionTargetChange: (followQuickExecutionTarget: boolean) => void
  readonly reduceVisualNoise: boolean
  readonly onReduceVisualNoiseChange: (reduceVisualNoise: boolean) => void
}) {
  const { t } = useI18n()
  const visualNoiseDescriptionId = 'canvas-settings-visual-noise-description'
  const quickExecutionFollowDescriptionId = 'canvas-settings-quick-execution-follow-description'

  return (
    <div className="canvas-settings-pane">
      <header className="canvas-settings-pane__header">
        <h2>{t('settings.canvas.title')}</h2>
      </header>
      <section className="canvas-settings-group" aria-label={t('settings.canvas.title')}>
        <div className="canvas-settings-row">
          <span className="canvas-settings-row__copy">
            <strong>{t('settings.canvas.reduceVisualNoise')}</strong>
            <span id={visualNoiseDescriptionId}>
              {t('settings.canvas.reduceVisualNoiseDescription')}
            </span>
          </span>
          <ApplicationSettingsSwitch
            checked={reduceVisualNoise}
            aria-describedby={visualNoiseDescriptionId}
            label={t('settings.canvas.reduceVisualNoise')}
            onClick={() => onReduceVisualNoiseChange(!reduceVisualNoise)}
          />
        </div>
        <div className="canvas-settings-row">
          <span className="canvas-settings-row__copy">
            <strong>{t('settings.canvas.followQuickExecutionTarget')}</strong>
            <span id={quickExecutionFollowDescriptionId}>
              {t('settings.canvas.followQuickExecutionTargetDescription')}
            </span>
          </span>
          <ApplicationSettingsSwitch
            checked={followQuickExecutionTarget}
            aria-describedby={quickExecutionFollowDescriptionId}
            label={t('settings.canvas.followQuickExecutionTarget')}
            onClick={() => onFollowQuickExecutionTargetChange(!followQuickExecutionTarget)}
          />
        </div>
      </section>
    </div>
  )
}
