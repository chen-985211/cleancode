import { FlowArrowIcon } from '@phosphor-icons/react/dist/csr/FlowArrow'
import { StopIcon } from '@phosphor-icons/react/dist/csr/Stop'
import type { Icon, IconWeight } from '@phosphor-icons/react'

import type { WorkflowRunNodeStatus } from '../../application/dto/WorkflowRunSnapshot'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { TooltipLabel } from '../../../../presentation/shared/components/Tooltip'
import { WorkbenchIcon } from '../../../../presentation/shared/components/WorkbenchIcons'

export interface TerminalRuntimeActionsProps {
  readonly terminalName: string
  readonly canQuickLaunch: boolean
  readonly isRecoveryPending: boolean
  readonly isActiveWorkflowRoot: boolean
  readonly isStoppingWorkflow: boolean
  readonly onRunFromHere: () => void
  readonly onStopWorkflow: () => void
  readonly onQuickLaunch: () => void
}

export function TerminalRuntimeActions({
  terminalName,
  canQuickLaunch,
  isRecoveryPending,
  isActiveWorkflowRoot,
  isStoppingWorkflow,
  onRunFromHere,
  onStopWorkflow,
  onQuickLaunch
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
            action: launchCommandTooltip
          })}
          data-launch-command-state={launchCommandState}
          disabled={isRecoveryPending && canQuickLaunch}
          onClick={onQuickLaunch}
        >
          <WorkbenchIcon
            data-icon="terminal-launch"
            role={canQuickLaunch ? 'launch' : 'settings'}
            size={15}
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
