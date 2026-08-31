import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import { terminalScrollbackOptions } from '../view-models/terminalRuntimePreference'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { useSelectionIndicatorMotion } from '../../../../presentation/shared/hooks/useSelectionMotion'

interface TerminalScrollbackSettingsSectionProps {
  readonly scrollbackRows: TerminalScrollbackRows
  readonly onScrollbackChange: (rows: TerminalScrollbackRows) => void
}

export function TerminalScrollbackSettingsSection({
  scrollbackRows,
  onScrollbackChange
}: TerminalScrollbackSettingsSectionProps) {
  const { t } = useI18n()
  const [selectionContainerRef, selectionIndicatorRef] = useSelectionIndicatorMotion(
    `${scrollbackRows}`
  )

  return (
    <section className="terminal-settings-group" aria-labelledby="terminal-scrollback-title">
      <h3 id="terminal-scrollback-title">{t('settings.terminal.scrollback')}</h3>
      <div
        ref={selectionContainerRef}
        className="terminal-settings-options"
        role="radiogroup"
        aria-labelledby="terminal-scrollback-title"
      >
        <span
          ref={selectionIndicatorRef}
          className="selection-motion-indicator terminal-settings-options__selection"
          data-selection-motion-target={scrollbackRows}
          aria-hidden="true"
        />
        {terminalScrollbackOptions.map((rows) => (
          <label data-selection-motion-option={rows} key={rows}>
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
  )
}
