import { ArrowClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowClockwise'
import { FlowArrowIcon } from '@phosphor-icons/react/dist/csr/FlowArrow'
import { PlayIcon } from '@phosphor-icons/react/dist/csr/Play'
import { PushPinIcon } from '@phosphor-icons/react/dist/csr/PushPin'
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop'
import type { Icon, IconWeight } from '@phosphor-icons/react'

import type {
  TerminalRetentionPolicy,
  TerminalSessionKind
} from '../../application/dto/TerminalSessionSnapshot'
import type { WorkflowRunNodeStatus } from '../../application/dto/WorkflowRunSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'

export interface TerminalRuntimeActionsProps {
  readonly terminalName: string
  readonly canQuickLaunch: boolean
  readonly isRunning: boolean
  readonly isRecoveryPending: boolean
  readonly sessionKind: TerminalSessionKind | null | undefined
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly onRunFromHere: () => void
  readonly onStopWorkflow: () => void
  readonly onQuickLaunch: () => void
  readonly onStop: () => void
  readonly onToggleRetention: () => void
  readonly onRestart: () => void
}

export function TerminalRuntimeActions({
  terminalName,
  canQuickLaunch,
  isRunning,
  isRecoveryPending,
  sessionKind,
  retentionPolicy,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  onRunFromHere,
  onStopWorkflow,
  onQuickLaunch,
  onStop,
  onToggleRetention,
  onRestart
}: TerminalRuntimeActionsProps) {
  const { t } = useI18n()
  const launchCommandState = canQuickLaunch ? 'configured' : 'unconfigured'
  const launchCommandTooltip = canQuickLaunch
    ? t('terminal.action.launch')
    : t('terminal.action.configureLaunch')
  const workflowActionLabel = isActiveWorkflowRoot
    ? isStoppingWorkflow
      ? t('terminal.action.stoppingWorkflow')
      : t('terminal.action.stopWorkflow')
    : t('terminal.action.runWorkflow')
  const isRetained = retentionPolicy === 'keep-after-application-exit'
  const isWorkflowRetentionUnavailable = sessionKind === 'workflow'
  const retentionActionLabel = isWorkflowRetentionUnavailable
    ? t('terminal.retention.workflowUnavailable')
    : isRetained
      ? t('terminal.retention.disable')
      : t('terminal.retention.enable')

  return (
    <>
      <TooltipLabel content={workflowActionLabel}>
        <button
          className={`terminal-node__action terminal-node__action--workflow${isActiveWorkflowRoot ? ' terminal-node__action--workflow-stop' : ''}`}
          type="button"
          aria-label={t('terminal.namedAction', {
            blockName: terminalName,
            action: isActiveWorkflowRoot
              ? workflowActionLabel
              : t('terminal.action.runTerminalWorkflow')
          })}
          disabled={
            isActiveWorkflowRoot ? isStoppingWorkflow : isRecoveryPending || !canQuickLaunch
          }
          onClick={isActiveWorkflowRoot ? onStopWorkflow : onRunFromHere}
        >
          {isActiveWorkflowRoot ? (
            <TerminalRuntimeActionIcon
              IconComponent={StopIcon}
              dataIcon="terminal-workflow-stop"
              glyph="stop"
              role="stop"
              size={15}
              weight="fill"
            />
          ) : (
            <TerminalRuntimeActionIcon
              IconComponent={FlowArrowIcon}
              dataIcon="terminal-workflow-run"
              glyph="flow-arrow"
              role="workflow"
              size={15}
              weight="regular"
            />
          )}
        </button>
      </TooltipLabel>
      <TooltipLabel content={launchCommandTooltip}>
        <button
          className={[
            'terminal-node__action',
            'terminal-node__action--launch',
            `terminal-node__action--launch-${launchCommandState}`
          ].join(' ')}
          type="button"
          aria-label={t('terminal.namedAction', {
            blockName: terminalName,
            action: t('terminal.action.launch')
          })}
          data-launch-command-state={launchCommandState}
          disabled={isRecoveryPending && canQuickLaunch}
          onClick={onQuickLaunch}
        >
          <TerminalRuntimeActionIcon
            IconComponent={PlayIcon}
            dataIcon="terminal-launch"
            glyph="play"
            role="launch"
            size={15}
            weight="fill"
          />
        </button>
      </TooltipLabel>
      <TooltipLabel content={t('terminal.action.stopCommand')}>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={t('terminal.namedAction', {
            blockName: terminalName,
            action: t('terminal.action.stopCommand')
          })}
          disabled={!isRunning || isRecoveryPending}
          onClick={onStop}
        >
          <TerminalRuntimeActionIcon
            IconComponent={StopIcon}
            dataIcon="terminal-stop-command"
            glyph="stop"
            role="stop"
            size={14}
            weight="fill"
          />
        </button>
      </TooltipLabel>
      <TooltipLabel content={retentionActionLabel}>
        <button
          className={`terminal-node__action terminal-node__action--retention${isRetained ? ' terminal-node__action--retention-active' : ''}`}
          type="button"
          aria-label={t('terminal.namedAction', {
            blockName: terminalName,
            action: retentionActionLabel
          })}
          aria-pressed={isRetained}
          aria-disabled={isWorkflowRetentionUnavailable || undefined}
          disabled={!isRunning || isRecoveryPending}
          onClick={isWorkflowRetentionUnavailable ? undefined : onToggleRetention}
        >
          <TerminalRuntimeActionIcon
            IconComponent={PushPinIcon}
            dataIcon="terminal-retention"
            glyph="push-pin"
            role="retention"
            size={14}
            weight={isRetained ? 'fill' : 'bold'}
          />
        </button>
      </TooltipLabel>
      <TooltipLabel content={t('terminal.action.restartEmptyDescription')}>
        <button
          className="terminal-node__action"
          type="button"
          aria-label={t('terminal.namedAction', {
            blockName: terminalName,
            action: t('terminal.action.restartEmpty')
          })}
          disabled={isRecoveryPending}
          onClick={onRestart}
        >
          <TerminalRuntimeActionIcon
            IconComponent={ArrowClockwiseIcon}
            dataIcon="terminal-restart"
            glyph="arrow-clockwise"
            role="restart"
            size={16}
            weight="bold"
          />
        </button>
      </TooltipLabel>
    </>
  )
}

export function TerminalWorkflowStatusBadge({
  status
}: {
  readonly status: WorkflowRunNodeStatus | undefined
}) {
  const { t } = useI18n()

  return status ? (
    <span className={`workflow-state workflow-state--${status}`}>
      {t(`workflow.status.${status}`)}
    </span>
  ) : null
}

interface TerminalRuntimeActionIconProps {
  readonly IconComponent: Icon
  readonly dataIcon: string
  readonly glyph: string
  readonly role: string
  readonly size: number
  readonly weight: IconWeight
}

function TerminalRuntimeActionIcon({
  IconComponent,
  dataIcon,
  glyph,
  role,
  size,
  weight
}: TerminalRuntimeActionIconProps) {
  return (
    <IconComponent
      aria-hidden="true"
      data-icon={dataIcon}
      data-icon-glyph={glyph}
      data-icon-role={role}
      data-icon-weight={weight}
      focusable="false"
      size={size}
      weight={weight}
    />
  )
}
