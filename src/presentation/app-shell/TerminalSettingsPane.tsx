import type { TerminalScrollbackRows } from '../../contexts/run/application/dto/TerminalRuntimeSettings'
import { terminalScrollbackOptions } from './terminalRuntimePreference'
import { useI18n } from './i18n/useI18n'

interface TerminalSettingsPaneProps {
  readonly scrollbackRows: TerminalScrollbackRows
  readonly onScrollbackChange: (rows: TerminalScrollbackRows) => void
}

export function TerminalSettingsPane({
  scrollbackRows,
  onScrollbackChange
}: TerminalSettingsPaneProps) {
  const { t } = useI18n()

  return (
    <div className="terminal-settings-pane">
      <header className="terminal-settings-pane__header">
        <h2>{t('settings.terminal.title')}</h2>
        <p>{t('settings.terminal.description')}</p>
      </header>
      <fieldset className="terminal-settings-group">
        <legend>{t('settings.terminal.scrollback')}</legend>
        <p>{t('settings.terminal.scrollbackDescription')}</p>
        <div className="terminal-settings-options">
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
      </fieldset>
    </div>
  )
}
