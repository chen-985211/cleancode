import type { ApplicationShortcutBindings, ShortcutPlatform } from './applicationShortcuts'
import { ApplicationSettingsRoot } from './ApplicationSettingsRoot'
import { BlockTemplateSurfaces } from './BlockTemplateSurfaces'
import { LanguageSettingsRoot } from './LanguageSettingsRoot'
import { ThemeSettingsRoot } from './ThemeSettingsRoot'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'
import type { useAgentCreationProviders } from '../../contexts/agent/presentation/view-models/useAgentCreationProviders'
import type { useApplicationSettingsNavigation } from './useApplicationSettingsNavigation'
import type { useApplicationShortcutPreference } from './useApplicationShortcutPreference'
import type { useBlockTemplateActions } from './useBlockTemplateActions'
import { useI18n } from '../i18n/useI18n'
import type { TerminalWorkflowBuildMode } from './terminalWorkflowBuildPreference'

export function AppShellSettings({
  agentCreation,
  applicationSettings,
  bindings,
  blockTemplates,
  changeBinding,
  changeFollowQuickExecutionTarget,
  changeReduceVisualNoise,
  changeTerminalScrollback,
  changeTerminalWorkflowBuildMode,
  currentWorkbench,
  followQuickExecutionTarget,
  isDesktopRuntime,
  resetAllBindings,
  reduceVisualNoise,
  shortcutPlatform,
  terminalScrollbackRows,
  terminalWorkflowBuildMode
}: {
  readonly agentCreation: ReturnType<typeof useAgentCreationProviders>
  readonly applicationSettings: ReturnType<typeof useApplicationSettingsNavigation>
  readonly bindings: ApplicationShortcutBindings
  readonly blockTemplates: ReturnType<typeof useBlockTemplateActions>
  readonly changeBinding: (
    ...args: Parameters<ReturnType<typeof useApplicationShortcutPreference>['changeBinding']>
  ) => void
  readonly changeFollowQuickExecutionTarget: (followQuickExecutionTarget: boolean) => void
  readonly changeReduceVisualNoise: (reduceVisualNoise: boolean) => void
  readonly changeTerminalScrollback: (rows: 1000 | 5000 | 10000) => void
  readonly changeTerminalWorkflowBuildMode: (mode: TerminalWorkflowBuildMode) => void
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly followQuickExecutionTarget: boolean
  readonly isDesktopRuntime: boolean
  readonly resetAllBindings: () => void
  readonly reduceVisualNoise: boolean
  readonly shortcutPlatform: ShortcutPlatform
  readonly terminalScrollbackRows: 1000 | 5000 | 10000
  readonly terminalWorkflowBuildMode: TerminalWorkflowBuildMode
}) {
  const { t } = useI18n()

  return (
    <div className="app-shell__settings" role="group" aria-label={t('app.settings')}>
      <BlockTemplateSurfaces
        actions={blockTemplates}
        currentWorkbench={currentWorkbench}
        isDesktopRuntime={isDesktopRuntime}
      />
      <LanguageSettingsRoot />
      <ThemeSettingsRoot />
      <ApplicationSettingsRoot
        agentProviderPreferences={agentCreation.agentProviderPreferences.state.preferences}
        agentProviderPreferencesStatus={agentCreation.agentProviderPreferences.state.status}
        bindings={bindings}
        defaultAgentProviderId={agentCreation.effectiveAgentProviderId}
        initialPane={applicationSettings.initialPane}
        isOpen={applicationSettings.isOpen}
        platform={shortcutPlatform}
        onBindingChange={changeBinding}
        onClose={applicationSettings.close}
        onOpen={applicationSettings.open}
        onAgentProviderPreferencesChange={agentCreation.agentProviderPreferences.update}
        onAgentProvidersRefresh={() => agentCreation.creatableAgentProviders.refresh(true)}
        onResetAll={resetAllBindings}
        followQuickExecutionTarget={followQuickExecutionTarget}
        onFollowQuickExecutionTargetChange={changeFollowQuickExecutionTarget}
        reduceVisualNoise={reduceVisualNoise}
        onReduceVisualNoiseChange={changeReduceVisualNoise}
        terminalScrollbackRows={terminalScrollbackRows}
        onTerminalScrollbackChange={changeTerminalScrollback}
        terminalWorkflowBuildMode={terminalWorkflowBuildMode}
        onTerminalWorkflowBuildModeChange={changeTerminalWorkflowBuildMode}
      />
    </div>
  )
}
