import type { TerminalScrollbackRows } from '../../../../contexts/run/application/dto/TerminalRuntimeSettings'
import { TerminalScrollbackSettingsSection } from '../../../../contexts/run/presentation/components/TerminalScrollbackSettingsSection'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'
import { useI18n } from '../../../i18n/useI18n'
import { ElasticSegmentedControl } from '../../../shared/components/ElasticSegmentedControl'

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
      <TerminalScrollbackSettingsSection
        scrollbackRows={scrollbackRows}
        onScrollbackChange={onScrollbackChange}
      />
      <section className="terminal-settings-group" aria-labelledby="terminal-workflow-build-title">
        <h3 id="terminal-workflow-build-title">{t('settings.terminal.workflowBuild')}</h3>
        <ElasticSegmentedControl
          labelledBy="terminal-workflow-build-title"
          describedBy="terminal-workflow-build-description"
          value={terminalWorkflowBuildMode}
          onChange={onTerminalWorkflowBuildModeChange}
          options={(['progressive', 'simultaneous'] as const).map((mode) => ({
            value: mode,
            label: t(`settings.terminal.workflowBuild.${mode}`),
            description: t(`settings.terminal.workflowBuild.${mode}Description`)
          }))}
        />
        <p id="terminal-workflow-build-description" className="terminal-settings-description">
          {t(`settings.terminal.workflowBuild.${terminalWorkflowBuildMode}Description`)}
        </p>
      </section>
    </div>
  )
}
