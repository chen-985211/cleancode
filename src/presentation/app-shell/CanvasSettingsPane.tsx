import { useI18n } from './i18n/useI18n'
import { ApplicationSettingsSwitch } from './ApplicationSettingsSwitch'

export function CanvasSettingsPane({
  reduceVisualNoise,
  onReduceVisualNoiseChange
}: {
  readonly reduceVisualNoise: boolean
  readonly onReduceVisualNoiseChange: (reduceVisualNoise: boolean) => void
}) {
  const { t } = useI18n()
  const descriptionId = 'canvas-settings-visual-noise-description'

  return (
    <div className="canvas-settings-pane">
      <header className="canvas-settings-pane__header">
        <h2>{t('settings.canvas.title')}</h2>
      </header>
      <section className="canvas-settings-group" aria-label={t('settings.canvas.title')}>
        <div className="canvas-settings-row">
          <span className="canvas-settings-row__copy">
            <strong>{t('settings.canvas.reduceVisualNoise')}</strong>
            <span id={descriptionId}>{t('settings.canvas.reduceVisualNoiseDescription')}</span>
          </span>
          <ApplicationSettingsSwitch
            checked={reduceVisualNoise}
            aria-describedby={descriptionId}
            label={t('settings.canvas.reduceVisualNoise')}
            onClick={() => onReduceVisualNoiseChange(!reduceVisualNoise)}
          />
        </div>
      </section>
    </div>
  )
}
