import { Bot, Box, Check, Terminal, X } from 'lucide-react'
import { useI18n } from './i18n/useI18n'

interface WorkbenchToolbarProps {
  readonly isDesktopRuntime: boolean
  readonly hasWorkbench: boolean
  readonly isTerminalGroupSelectionMode: boolean
  readonly selectedTerminalGroupCandidateCount: number
  readonly canBeginTerminalGroupSelection: boolean
  readonly canCreateTerminalGroup: boolean
  readonly onCreateTerminalBlock: () => void
  readonly onCreateWorkspaceAgent: () => void
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
        <button
          className="toolbar-button toolbar-button--primary"
          type="button"
          onClick={props.onCreateTerminalBlock}
          disabled={!props.isDesktopRuntime || !props.hasWorkbench}
        >
          <Terminal size={16} aria-hidden="true" />
          {t('toolbar.newTerminal')}
        </button>
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
        )}
      </div>
      <div
        className="app-shell__toolbar-group app-shell__toolbar-group--agent"
        role="group"
        aria-label={t('toolbar.agentTools')}
      >
        <button
          className="toolbar-button"
          type="button"
          onClick={props.onCreateWorkspaceAgent}
          disabled={!props.isDesktopRuntime || !props.hasWorkbench}
        >
          <Bot size={16} aria-hidden="true" />
          {t('toolbar.newAgent')}
        </button>
      </div>
    </div>
  )
}
