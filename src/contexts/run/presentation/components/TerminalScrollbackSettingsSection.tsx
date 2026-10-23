import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import { terminalScrollbackOptions } from '../view-models/terminalRuntimePreference'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { ElasticSegmentedControl } from '../../../../presentation/shared/components/ElasticSegmentedControl'

interface TerminalScrollbackSettingsSectionProps {
  readonly scrollbackRows: TerminalScrollbackRows
  readonly onScrollbackChange: (rows: TerminalScrollbackRows) => void
}

export function TerminalScrollbackSettingsSection({
  scrollbackRows,
  onScrollbackChange
}: TerminalScrollbackSettingsSectionProps) {
  const { t } = useI18n()

  return (
    <section className="terminal-settings-group" aria-labelledby="terminal-scrollback-title">
      <h3 id="terminal-scrollback-title">{t('settings.terminal.scrollback')}</h3>
      <ElasticSegmentedControl
        labelledBy="terminal-scrollback-title"
        value={`${scrollbackRows}`}
        options={terminalScrollbackOptions.map((rows) => ({
          value: `${rows}`,
          label: t('settings.terminal.scrollbackRows', { rows: rows.toLocaleString() })
        }))}
        onChange={(value) => {
          const rows = terminalScrollbackOptions.find((option) => `${option}` === value)
          if (rows !== undefined) onScrollbackChange(rows)
        }}
      />
    </section>
  )
}
