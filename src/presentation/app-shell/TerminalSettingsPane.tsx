import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import { TerminalScrollbackSettingsSection } from '../../contexts/run/presentation/components/TerminalScrollbackSettingsSection'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'
import { useI18n } from '../i18n/useI18n'
import { useSelectionIndicatorMotion } from '../shared/hooks/useSelectionMotion'

interface TerminalSettingsPaneProps {
  readonly scrollbackRows: TerminalScrollbackRows
  readonly onScrollbackChange: (rows: TerminalScrollbackRows) => void
  readonly terminalWorkflowBuildMode: TerminalWorkflowBuildMode
  readonly onTerminalWorkflowBuildModeChange: (mode: TerminalWorkflowBuildMode) => void
}

export function TerminalSettingsPane({
  scrollbackRows,
  onScrollbackChange,
  terminalWorkflowBuildMode,
  onTerminalWorkflowBuildModeChange
}: TerminalSettingsPaneProps) {
  const { t } = useI18n()
  const [workflowSelectionContainerRef, workflowSelectionIndicatorRef] =
    useSelectionIndicatorMotion(terminalWorkflowBuildMode)

  return (
    <div className="terminal-settings-pane">
      <header className="terminal-settings-pane__header">
        <h2>{t('settings.terminal.title')}</h2>
      </header>
      <TerminalScrollbackSettingsSection
        scrollbackRows={scrollbackRows}
        onScrollbackChange={onScrollbackChange}
      />
      <section className="terminal-settings-group" aria-labelledby="terminal-workflow-build-title">
        <h3 id="terminal-workflow-build-title">{t('settings.terminal.workflowBuild')}</h3>
        <div
          ref={workflowSelectionContainerRef}
          className="terminal-settings-options terminal-settings-options--workflow-build"
          role="radiogroup"
          aria-labelledby="terminal-workflow-build-title"
        >
          <span
            ref={workflowSelectionIndicatorRef}
            className="selection-motion-indicator terminal-settings-options__selection"
            data-selection-motion-target={terminalWorkflowBuildMode}
            aria-hidden="true"
          />
          {(['progressive', 'simultaneous'] as const).map((mode) => (
            <label data-selection-motion-option={mode} key={mode}>
              <input
                type="radio"
                name="terminal-workflow-build-mode"
                checked={terminalWorkflowBuildMode === mode}
                onChange={() => onTerminalWorkflowBuildModeChange(mode)}
              />
              <span className="terminal-settings-option-copy">
                <span className="terminal-settings-option-copy__title">
                  {t(`settings.terminal.workflowBuild.${mode}`)}
                </span>
                <span className="terminal-settings-option-copy__description">
                  {t(`settings.terminal.workflowBuild.${mode}Description`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
