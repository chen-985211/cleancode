import type {
  TerminalRetentionPolicy,
  TerminalSessionKind
} from '../../application/dto/TerminalSessionSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { CanvasMenuItem } from '../../../../presentation/shared/components/CanvasMenuItem'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'

export interface TerminalSessionMenuItemsProps {
  readonly terminalName: string
  readonly isRunning: boolean
  readonly isRecoveryPending: boolean
  readonly sessionKind: TerminalSessionKind | null | undefined
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly onStop: () => void
  readonly onToggleRetention: () => void
  readonly onRestart: () => void
  readonly onAction: () => void
}

export function TerminalSessionMenuItems({
  terminalName,
  isRunning,
  isRecoveryPending,
  sessionKind,
  retentionPolicy,
  onStop,
  onToggleRetention,
  onRestart,
  onAction
}: TerminalSessionMenuItemsProps) {
  const { t } = useI18n()
  const isRetained = retentionPolicy === 'keep-after-application-exit'
  const isWorkflow = sessionKind === 'workflow'
  const retentionLabel = t(
    isWorkflow
      ? 'terminal.retention.workflowUnavailable'
      : isRetained
        ? 'terminal.retention.disable'
        : 'terminal.retention.enable'
  )
  const named = (action: string) => t('terminal.namedAction', { blockName: terminalName, action })
  const run = (action: () => void) => {
    onAction()
    action()
  }
  return (
    <>
      <CanvasMenuItem
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-label={named(t('terminal.action.stopCommand'))}
        disabled={!isRunning || isRecoveryPending}
        onClick={() => run(onStop)}
      >
        <WorkbenchIcon role="stop" data-icon="terminal-stop-command" size={16} />
        <span className="canvas-pane-context-menu__label">{t('terminal.action.stopCommand')}</span>
      </CanvasMenuItem>
      <TooltipLabel content={retentionLabel}>
        <CanvasMenuItem
          type="button"
          role="menuitemcheckbox"
          tabIndex={-1}
          aria-label={named(retentionLabel)}
          aria-checked={isRetained}
          aria-disabled={isWorkflow || undefined}
          disabled={!isRunning || isRecoveryPending}
          onClick={isWorkflow ? undefined : () => run(onToggleRetention)}
        >
          <WorkbenchIcon
            role="retention"
            active={isRetained}
            data-icon="terminal-retention"
            size={16}
          />
          <span className="canvas-pane-context-menu__label">{retentionLabel}</span>
        </CanvasMenuItem>
      </TooltipLabel>
      <TooltipLabel content={t('terminal.action.restartEmptyDescription')}>
        <CanvasMenuItem
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-label={named(t('terminal.action.restartEmpty'))}
          disabled={isRecoveryPending}
          onClick={() => run(onRestart)}
        >
          <WorkbenchIcon role="restart" data-icon="terminal-restart" size={16} />
          <span className="canvas-pane-context-menu__label">
            {t('terminal.action.restartEmpty')}
          </span>
        </CanvasMenuItem>
      </TooltipLabel>
    </>
  )
}
