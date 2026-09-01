import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { AgentCreateSplitButton } from './AgentCreateSplitButton'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useI18n } from '../i18n/useI18n'
import { WorkbenchIcon } from '../shared/components/WorkbenchIcons'

interface WorkbenchToolbarProps {
  readonly agentProviders?: readonly CreatableAgentProviderSnapshot[]
  readonly defaultAgentProviderId?: string | null
  readonly isDesktopRuntime: boolean
  readonly isCreatingAgent?: boolean
  readonly isAgentProviderDiscoveryPending?: boolean
  readonly hasWorkbench: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canCreateTerminalGroup?: boolean
  readonly shortcutTooltips: Pick<ApplicationShortcutTooltipLabels, 'createAgent'>
  readonly onCreateWorkspaceAgent: (providerId?: string) => void
  readonly onOpenAgentSettings?: () => void
  readonly onSelectDefaultAgentProvider?: (providerId: string) => void
  readonly onCreateTerminalGroup?: () => void
  readonly onCancelTerminalGroupSelection: () => void
}

export function WorkbenchToolbar(props: WorkbenchToolbarProps) {
  const { t } = useI18n()
  return (
    <div
      className="app-shell__toolbar"
      data-workbench-canvas-obstruction
      role="toolbar"
      aria-label={t('toolbar.label')}
    >
      {props.isTerminalGroupSelectionMode ? (
        <div
          className="app-shell__toolbar-group app-shell__toolbar-group--terminal-group-editing"
          data-selection-mode="active"
          role="group"
          aria-label={t('toolbar.terminalTools')}
        >
          <span className="toolbar-selection-status" role="status" aria-live="polite">
            <WorkbenchIcon role="terminal-group" size={15} />
            {t('toolbar.groupEditing')}
            <strong>{props.selectedTerminalGroupCandidateCount}</strong>
          </span>
          <button
            className="toolbar-button"
            type="button"
            onClick={props.onCancelTerminalGroupSelection}
          >
            <WorkbenchIcon role="close" size={16} />
            {t('toolbar.finish')}
          </button>
        </div>
      ) : null}
      <div
        className="app-shell__toolbar-group app-shell__toolbar-group--agent"
        role="group"
        aria-label={t('toolbar.agentTools')}
      >
        <AgentCreateSplitButton
          defaultProviderId={props.defaultAgentProviderId ?? null}
          disabled={
            !props.isDesktopRuntime ||
            !props.hasWorkbench ||
            props.isAgentProviderDiscoveryPending === true
          }
          isCreating={props.isCreatingAgent ?? false}
          providers={props.agentProviders ?? []}
          shortcutTooltip={props.shortcutTooltips.createAgent}
          onCreate={props.onCreateWorkspaceAgent}
          onOpenAgentSettings={props.onOpenAgentSettings ?? noop}
          onSelectDefault={props.onSelectDefaultAgentProvider ?? noop}
        />
      </div>
    </div>
  )
}

function noop(): void {}
