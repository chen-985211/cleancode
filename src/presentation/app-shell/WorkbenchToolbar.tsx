import { Box, Check, Terminal, X } from 'lucide-react'
import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { AgentCreateSplitButton } from './AgentCreateSplitButton'
import type { ApplicationShortcutTooltipLabels } from './applicationShortcutTooltips'
import { useI18n } from './i18n/useI18n'
import { TooltipLabel } from './Tooltip'

interface WorkbenchToolbarProps {
  readonly agentProviders?: readonly CreatableAgentProviderSnapshot[]
  readonly defaultAgentProviderId?: string | null
  readonly isDesktopRuntime: boolean
  readonly isCreatingAgent?: boolean
  readonly isAgentProviderDiscoveryPending?: boolean
  readonly hasWorkbench: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection: boolean
  readonly canCreateTerminalGroup: boolean
  readonly shortcutTooltips: Pick<
    ApplicationShortcutTooltipLabels,
    'createAgent' | 'createTerminal' | 'groupTerminals'
  >
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: () => void
  readonly onOpenAgentSettings?: () => void
  readonly onSelectDefaultAgentProvider?: (providerId: string) => void
  readonly onBeginTerminalGroupSelection: () => void
  readonly onCreateTerminalGroup: () => void
  readonly onCancelTerminalGroupSelection: () => void
}

export function WorkbenchToolbar(props: WorkbenchToolbarProps) {
  const { t } = useI18n()
  return (
    <div className="app-shell__toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <div
        className="app-shell__toolbar-group"
        role="group"
        aria-label={t('toolbar.terminalTools')}
      >
        <TooltipLabel content={props.shortcutTooltips.createTerminal} side="bottom">
          <button
            className="toolbar-button toolbar-button--primary"
            type="button"
            onClick={props.onCreateTerminalBlock}
            disabled={!props.isDesktopRuntime || !props.hasWorkbench}
          >
            <Terminal size={16} aria-hidden="true" />
            {t('toolbar.newTerminal')}
          </button>
        </TooltipLabel>
        <span className="toolbar-divider" aria-hidden="true" />
        {props.isTerminalGroupSelectionMode ? (
          <>
            <span className="toolbar-selection-status" role="status">
              {t('toolbar.groupEditing')}
              <strong>{props.selectedTerminalGroupCandidateCount}</strong>
            </span>
            <button
              className="toolbar-button toolbar-button--primary"
              type="button"
              onClick={props.onCreateTerminalGroup}
              disabled={!props.canCreateTerminalGroup}
            >
              <Check size={16} aria-hidden="true" />
              {t('toolbar.createGroup')}
            </button>
            <button
              className="toolbar-button"
              type="button"
              onClick={props.onCancelTerminalGroupSelection}
            >
              <X size={16} aria-hidden="true" />
              {t('toolbar.finish')}
            </button>
          </>
        ) : (
          <TooltipLabel content={props.shortcutTooltips.groupTerminals} side="bottom">
            <button
              className="toolbar-button"
              type="button"
              onClick={props.onBeginTerminalGroupSelection}
              disabled={
                !props.isDesktopRuntime ||
                !props.hasWorkbench ||
                !props.canBeginTerminalGroupSelection
              }
            >
              <Box size={16} aria-hidden="true" />
              {t('toolbar.groupTerminals')}
            </button>
          </TooltipLabel>
        )}
      </div>
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
