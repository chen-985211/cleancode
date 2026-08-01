import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import { terminalScrollbackOptions } from './terminalRuntimePreference'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'
import { useI18n } from './i18n/useI18n'

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

  return (
    <div className="terminal-settings-pane">
      <header className="terminal-settings-pane__header">
        <h2>{t('settings.terminal.title')}</h2>
      </header>
      <section className="terminal-settings-group" aria-labelledby="terminal-scrollback-title">
        <h3 id="terminal-scrollback-title">{t('settings.terminal.scrollback')}</h3>
        <div
          className="terminal-settings-options"
          role="radiogroup"
          aria-labelledby="terminal-scrollback-title"
        >
          {terminalScrollbackOptions.map((rows) => (
            <label key={rows}>
              <input
                type="radio"
                name="terminal-scrollback"
                checked={scrollbackRows === rows}
                onChange={() => onScrollbackChange(rows)}
              />
              <span>{t('settings.terminal.scrollbackRows', { rows: rows.toLocaleString() })}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="terminal-settings-group" aria-labelledby="terminal-workflow-build-title">
        <h3 id="terminal-workflow-build-title">{t('settings.terminal.workflowBuild')}</h3>
        <div
          className="terminal-settings-options terminal-settings-options--workflow-build"
          role="radiogroup"
          aria-labelledby="terminal-workflow-build-title"
        >
          {(['progressive', 'parallel'] as const).map((mode) => (
            <label key={mode}>
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
