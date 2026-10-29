import { useI18n } from '../../../i18n/useI18n'
import { ApplicationSettingsSwitch } from '../../../shared/components/ApplicationSettingsSwitch'
import { ElasticSegmentedControl } from '../../../shared/components/ElasticSegmentedControl'
import type { CanvasNodeFocusMode } from './canvasNodeFocusPreference'

export function CanvasSettingsPane({
  nodeFocusMode,
  onNodeFocusModeChange,
  followQuickExecutionTarget,
  onFollowQuickExecutionTargetChange,
  reduceVisualNoise,
  onReduceVisualNoiseChange
}: {
  readonly nodeFocusMode: CanvasNodeFocusMode
  readonly onNodeFocusModeChange: (mode: CanvasNodeFocusMode) => void
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
      <section className="canvas-settings-positioning" aria-labelledby="canvas-node-focus-title">
        <h3 id="canvas-node-focus-title">{t('settings.canvas.nodeFocus')}</h3>
        <ElasticSegmentedControl
          labelledBy="canvas-node-focus-title"
          describedBy="canvas-node-focus-description"
          value={nodeFocusMode}
          onChange={onNodeFocusModeChange}
          options={(['center', 'preserve-view'] as const).map((mode) => ({
            value: mode,
            label: t(`settings.canvas.nodeFocus.${mode}`),
            description: t(`settings.canvas.nodeFocus.${mode}Description`)
          }))}
        />
        <p id="canvas-node-focus-description" className="canvas-settings-positioning__description">
          {t(`settings.canvas.nodeFocus.${nodeFocusMode}Description`)}
        </p>
      </section>
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
