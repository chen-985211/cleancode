import type { AgentApprovalPresentation } from '../../../projections/agentApprovalPresentation'
import { useI18n } from '../../../../i18n/useI18n'
import { TooltipLabel } from '../../../../shared/components/Tooltip'
import type { Translate } from '../../../../i18n/messages'
import { WorkbenchIcon } from '../../../../shared/components/WorkbenchIcons'

interface AgentToolApprovalCardProps {
  readonly onApprove: () => void
  readonly onDismiss: () => void
  readonly onLocate: () => void
  readonly onReject: () => void
  readonly presentation: AgentApprovalPresentation
  readonly queueCount: number
}

export function AgentToolApprovalCard({
  onApprove,
  onDismiss,
  onLocate,
  onReject,
  presentation,
  queueCount
}: AgentToolApprovalCardProps) {
  const { t } = useI18n()
  const phase = presentation.approval.phase
  const isApproving = phase === 'approving'
  const isFailed = phase === 'failed'
  const isMissing = presentation.status === 'missing'
  const actionCopy = createActionCopy(presentation.targetKind, isApproving, t)
  const statusLabel = isMissing
    ? t('approval.status.missing')
    : isFailed
      ? t('approval.status.failed')
      : isApproving
        ? t('approval.status.approving')
        : t('approval.status.awaiting')

  return (
    <section
      className={[
        'agent-tool-approval-card',
        `agent-tool-approval-card--${phase}`,
        isMissing ? 'agent-tool-approval-card--missing' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={t('approval.region')}
    >
      <header className="agent-tool-approval-card__header">
        <span className="agent-tool-approval-card__status-icon" aria-hidden="true">
          <WorkbenchIcon role="approval" size={18} />
        </span>
        <div className="agent-tool-approval-card__heading">
          <span className="agent-tool-approval-card__eyebrow">{statusLabel}</span>
          <h3>{actionCopy.heading}</h3>
        </div>
        {queueCount > 0 ? (
          <span
            className="agent-tool-approval-card__queue"
            aria-label={t('approval.queue', { count: queueCount + 1 })}
          >
            1 / {queueCount + 1}
          </span>
        ) : null}
      </header>

      <div className="agent-tool-approval-card__body">
        {isMissing ? (
          <div className="agent-tool-approval-card__notice" role="status">
            <WorkbenchIcon role="warning" size={15} />
            <span>
              {t('approval.targetMissing')}
              <TooltipLabel content={presentation.targetId}>
                <code>{t('approval.targetId', { id: shortenId(presentation.targetId) })}</code>
              </TooltipLabel>
            </span>
          </div>
        ) : (
          <TargetDetails
            presentation={presentation}
            isLocatingDisabled={isApproving}
            onLocate={onLocate}
          />
        )}

        {isFailed ? (
          <div className="agent-tool-approval-card__error" role="alert">
            <WorkbenchIcon role="warning" size={15} />
            <span>{presentation.approval.errorMessage ?? t('approval.failedFallback')}</span>
          </div>
        ) : (
          <p className="agent-tool-approval-card__impact">
            <span className="agent-tool-approval-card__impact-icon" aria-hidden="true">
              <WorkbenchIcon role="warning" size={14} />
            </span>
            <span>{createImpact(presentation, t)}</span>
          </p>
        )}
      </div>

      <footer className="agent-tool-approval-card__actions">
        {isFailed ? (
          <button className="agent-tool-approval-card__button" type="button" onClick={onDismiss}>
            {t('common.close')}
          </button>
        ) : (
          <>
            <button
              className="agent-tool-approval-card__button"
              type="button"
              disabled={isApproving}
              onClick={onReject}
            >
              {actionCopy.retainLabel}
            </button>
            <button
              className="agent-tool-approval-card__button agent-tool-approval-card__button--danger"
              type="button"
              disabled={isApproving || isMissing}
              onClick={onApprove}
            >
              {isApproving ? (
                <WorkbenchIcon
                  className="agent-tool-approval-card__spinner"
                  role="loading"
                  size={14}
                />
              ) : null}
              {actionCopy.destructiveLabel}
            </button>
          </>
        )}
      </footer>
    </section>
  )
}

interface TargetDetailsProps {
  readonly isLocatingDisabled: boolean
  readonly onLocate: () => void
  readonly presentation: AgentApprovalPresentation
}

function TargetDetails({ isLocatingDisabled, onLocate, presentation }: TargetDetailsProps) {
  const { locale, t } = useI18n()
  if (presentation.status === 'missing') return null

  if (presentation.targetKind === 'terminal') {
    return (
      <div
        className="agent-tool-approval-card__target"
        role="group"
        aria-label={t('approval.target', { name: presentation.block.name })}
      >
        <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
          <WorkbenchIcon role="terminal" size={18} />
        </span>
        <div className="agent-tool-approval-card__target-copy">
          <span className="agent-tool-approval-card__target-type">
            {t('approval.targetTerminal')}
          </span>
          <strong>{presentation.block.name}</strong>
          <span className="agent-tool-approval-card__description">
            {presentation.block.description || t('approval.noDescription')}
          </span>
          <div className="agent-tool-approval-card__target-meta">
            <TooltipLabel content={presentation.block.id}>
              <code>{t('approval.targetId', { id: shortenId(presentation.block.id) })}</code>
            </TooltipLabel>
            {presentation.containingGroup ? (
              <span className="agent-tool-approval-card__membership">
                {t('approval.inGroup', { groupName: presentation.containingGroup.name })}
              </span>
            ) : null}
          </div>
        </div>
        <LocateTargetButton
          disabled={isLocatingDisabled}
          name={presentation.block.name}
          onLocate={onLocate}
        />
      </div>
    )
  }

  if (presentation.targetKind === 'connection') {
    const locateName = t('approval.connectionName', {
      sourceName: presentation.sourceBlock.name,
      targetName: presentation.targetBlock.name
    })

    return (
      <div
        className="agent-tool-approval-card__target agent-tool-approval-card__target--connection"
        role="group"
        aria-label={t('approval.target', { name: locateName })}
      >
        <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
          <WorkbenchIcon role="workflow" size={18} />
        </span>
        <div className="agent-tool-approval-card__target-copy">
          <span className="agent-tool-approval-card__target-type">
            {t('approval.targetConnection')}
          </span>
          <div className="agent-tool-approval-card__connection-endpoints">
            <ConnectionEndpoint
              direction="upstream"
              id={presentation.sourceBlock.id}
              name={presentation.sourceBlock.name}
            />
            <span className="agent-tool-approval-card__connection-arrow" aria-hidden="true">
              →
            </span>
            <ConnectionEndpoint
              direction="downstream"
              id={presentation.targetBlock.id}
              name={presentation.targetBlock.name}
            />
          </div>
          <div className="agent-tool-approval-card__target-meta">
            <TooltipLabel content={presentation.connection.id}>
              <code
                aria-label={t('approval.connectionId', {
                  connectionId: presentation.connection.id
                })}
                tabIndex={0}
              >
                {t('approval.connectionId', { connectionId: presentation.connection.id })}
              </code>
            </TooltipLabel>
          </div>
        </div>
        <LocateTargetButton disabled={isLocatingDisabled} name={locateName} onLocate={onLocate} />
      </div>
    )
  }

  return (
    <div
      className="agent-tool-approval-card__target"
      role="group"
      aria-label={t('approval.target', { name: presentation.group.name })}
    >
      <span className="agent-tool-approval-card__object-icon" aria-hidden="true">
        <WorkbenchIcon role="terminal-group" size={18} />
      </span>
      <div className="agent-tool-approval-card__target-copy">
        <span className="agent-tool-approval-card__target-type">{t('approval.targetGroup')}</span>
        <strong>{presentation.group.name}</strong>
        <span className="agent-tool-approval-card__description">
          {t('approval.groupMembers', {
            count: presentation.memberBlocks.length,
            members:
              presentation.memberBlocks
                .map((block) => block.name)
                .join(locale === 'zh-CN' ? '、' : ', ') || t('approval.noMembers')
          })}
        </span>
        <div className="agent-tool-approval-card__target-meta">
          <TooltipLabel content={presentation.group.id}>
            <code>{t('approval.targetId', { id: shortenId(presentation.group.id) })}</code>
          </TooltipLabel>
        </div>
      </div>
      <LocateTargetButton
        disabled={isLocatingDisabled}
        name={presentation.group.name}
        onLocate={onLocate}
      />
    </div>
  )
}

interface ConnectionEndpointProps {
  readonly direction: 'upstream' | 'downstream'
  readonly id: string
  readonly name: string
}

function ConnectionEndpoint({ direction, id, name }: ConnectionEndpointProps) {
  const { t } = useI18n()
  return (
    <span className="agent-tool-approval-card__connection-endpoint">
      <span className="agent-tool-approval-card__target-type">
        {direction === 'upstream'
          ? t('approval.upstreamTerminal')
          : t('approval.downstreamTerminal')}
      </span>
      <strong>{name}</strong>
      <TooltipLabel content={id}>
        <code>{t('approval.targetId', { id: shortenId(id) })}</code>
      </TooltipLabel>
    </span>
  )
}

interface LocateTargetButtonProps {
  readonly disabled: boolean
  readonly name: string
  readonly onLocate: () => void
}

function LocateTargetButton({ disabled, name, onLocate }: LocateTargetButtonProps) {
  const { t } = useI18n()
  return (
    <button
      className="agent-tool-approval-card__locate"
      type="button"
      aria-label={t('approval.locate', { name })}
      disabled={disabled}
      onClick={onLocate}
    >
      <WorkbenchIcon role="locate" size={14} />
      {t('approval.locateShort')}
    </button>
  )
}

function createImpact(presentation: AgentApprovalPresentation, t: Translate): string {
  if (presentation.status === 'missing') {
    return t('approval.impactMissing')
  }

  if (presentation.targetKind === 'terminal') {
    return t('approval.impactTerminal')
  }

  if (presentation.targetKind === 'connection') {
    return t('approval.impactConnection')
  }

  return t('approval.impactGroup')
}

function createActionCopy(
  targetKind: AgentApprovalPresentation['targetKind'],
  isApproving: boolean,
  t: Translate
): {
  readonly destructiveLabel: string
  readonly heading: string
  readonly retainLabel: string
} {
  if (targetKind === 'terminal') {
    return {
      destructiveLabel: isApproving ? t('approval.deleting') : t('approval.confirmDelete'),
      heading: t('approval.deleteTerminal'),
      retainLabel: t('approval.retainTerminal')
    }
  }

  if (targetKind === 'connection') {
    return {
      destructiveLabel: isApproving ? t('approval.disconnecting') : t('approval.confirmDisconnect'),
      heading: t('approval.disconnect'),
      retainLabel: t('approval.retainConnection')
    }
  }

  return {
    destructiveLabel: isApproving ? t('approval.dissolving') : t('approval.confirmDissolve'),
    heading: t('approval.dissolve'),
    retainLabel: t('approval.retainGroup')
  }
}

function shortenId(id: string): string {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
