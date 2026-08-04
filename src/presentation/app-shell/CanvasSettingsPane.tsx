import { useI18n } from './i18n/useI18n'

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
          <button
            aria-checked={reduceVisualNoise}
            aria-describedby={descriptionId}
            aria-label={t('settings.canvas.reduceVisualNoise')}
            className="application-settings-switch"
            role="switch"
            type="button"
            onClick={() => onReduceVisualNoiseChange(!reduceVisualNoise)}
          >
            <span />
          </button>
        </div>
      </section>
    </div>
  )
}
