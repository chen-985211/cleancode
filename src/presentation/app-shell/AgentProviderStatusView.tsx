import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

import type { AgentProviderAvailability } from '../../contexts/agent/application/ports/AgentProviderContribution'
import type { AgentBlockingFeedback, AgentFeedbackIssue } from './agentProviderFeedback'
import type { AgentProviderPanelState } from './useAgentProviderState'
import { useI18n } from './i18n/useI18n'
import { AnchoredSurfaceMotion } from './SurfaceMotion'
import { TooltipLabel } from './Tooltip'
import { WorkbenchIcon, type WorkbenchIconRole } from './WorkbenchIcons'
import { useOutsidePointerDismiss } from './useOutsidePointerDismiss'

interface PanelPosition {
  readonly left: number
  readonly side: 'bottom' | 'top'
  readonly top: number
}

export function AgentProviderStatusControl({
  agentName,
  issues,
  onNewConversation,
  onRestart,
  onRetryAttachment,
  providerName,
  state
}: {
  readonly agentName: string
  readonly issues: readonly AgentFeedbackIssue[]
  readonly onNewConversation?: () => void
  readonly onRestart?: () => void
  readonly onRetryAttachment?: () => void
  readonly providerName: string
  readonly state: AgentProviderPanelState
}) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<PanelPosition | null>(null)
  const didFocusPanelRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelId = `agent-status-${useId().replaceAll(':', '')}`

  useOutsidePointerDismiss({
    active: isOpen,
    isInside: (target) =>
      triggerRef.current?.contains(target) === true || panelRef.current?.contains(target) === true,
    onDismiss: () => {
      setIsOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
    },
    pointerPolicy: 'consume'
  })

  useEffect(() => {
    if (!isOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const positionPanel = (): void => {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!trigger || !panel) return
      const triggerRect = trigger.getBoundingClientRect()
      const panelWidth = panel.offsetWidth
      const panelHeight = panel.offsetHeight
      const padding = 8
      const gap = 6
      const opensAbove =
        triggerRect.bottom + gap + panelHeight > window.innerHeight - padding &&
        triggerRect.top - gap - panelHeight >= padding
      setPosition({
        left: Math.min(
          Math.max(padding, triggerRect.right - panelWidth),
          Math.max(padding, window.innerWidth - panelWidth - padding)
        ),
        side: opensAbove ? 'top' : 'bottom',
        top: opensAbove ? triggerRect.top - gap - panelHeight : triggerRect.bottom + gap
      })
    }
    positionPanel()
    window.addEventListener('resize', positionPanel)
    window.addEventListener('scroll', positionPanel, true)
    return () => {
      window.removeEventListener('resize', positionPanel)
      window.removeEventListener('scroll', positionPanel, true)
    }
  }, [isOpen, issues])

  useLayoutEffect(() => {
    if (!isOpen) {
      didFocusPanelRef.current = false
      return
    }
    if (position && !didFocusPanelRef.current) {
      panelRef.current?.focus({ preventScroll: true })
      didFocusPanelRef.current = true
    }
  }, [isOpen, position])

  if (issues.length === 0) return null
  const isNeutral = issues.every((issue) => issue === 'session_ended')
  const iconRole: WorkbenchIconRole = isNeutral ? 'paused' : 'error'
  const controlLabel = t('agent.statusCount', { agentName, count: issues.length })

  const runAction = (action: () => void): void => {
    setIsOpen(false)
    action()
  }

  return (
    <span className="agent-provider-status-control nodrag">
      <TooltipLabel content={controlLabel} side="bottom">
        <button
          className="agent-provider-status-control__trigger nodrag"
          type="button"
          aria-controls={isOpen ? panelId : undefined}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={controlLabel}
          data-tone={isNeutral ? 'neutral' : 'warning'}
          onClick={(event) => {
            event.stopPropagation()
            setPosition(null)
            setIsOpen((open) => !open)
          }}
          ref={triggerRef}
        >
          <WorkbenchIcon role={iconRole} size={15} />
          {issues.length > 1 ? (
            <span className="agent-provider-status-control__count" aria-hidden="true">
              {issues.length}
            </span>
          ) : null}
        </button>
      </TooltipLabel>
      <AnchoredSurfaceMotion
        open={isOpen}
        portalContainer={document.body}
        className="agent-provider-status-panel anchored-surface-motion nodrag nowheel"
        id={panelId}
        role="dialog"
        aria-label={t('agent.statusPanel', { agentName })}
        tabIndex={-1}
        data-side={position?.side ?? 'bottom'}
        ref={panelRef}
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          visibility: position ? 'visible' : 'hidden'
        }}
      >
        <div className="agent-provider-status-panel__header">
          <strong>{t('agent.statusTitle')}</strong>
          <TooltipLabel content={t('agent.statusClose')}>
            <button
              type="button"
              aria-label={t('agent.statusClose')}
              onClick={() => {
                setIsOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <WorkbenchIcon role="close" size={14} />
            </button>
          </TooltipLabel>
        </div>
        <div className="agent-provider-status-panel__issues">
          {issues.map((issue) => (
            <StatusIssue
              issue={issue}
              key={issue}
              onNewConversation={onNewConversation ? () => runAction(onNewConversation) : undefined}
              onRestart={onRestart ? () => runAction(onRestart) : undefined}
              onRetryAttachment={onRetryAttachment ? () => runAction(onRetryAttachment) : undefined}
              providerName={providerName}
              state={state}
            />
          ))}
        </div>
      </AnchoredSurfaceMotion>
    </span>
  )
}

function StatusIssue({
  issue,
  onNewConversation,
  onRestart,
  onRetryAttachment,
  providerName,
  state
}: {
  readonly issue: AgentFeedbackIssue
  readonly onNewConversation?: () => void
  readonly onRestart?: () => void
  readonly onRetryAttachment?: () => void
  readonly providerName: string
  readonly state: AgentProviderPanelState
}) {
  const { t } = useI18n()
  const isNeutral = issue === 'session_ended'
  const iconRole: WorkbenchIconRole = isNeutral ? 'paused' : 'error'
  const actions: Array<{ readonly label: string; readonly onClick: () => void }> = []
  if (issue === 'attachment_failed' && onRetryAttachment) {
    actions.push({ label: t('provider.retry'), onClick: onRetryAttachment })
  }
  if (issue === 'restore_failed' && onRestart) {
    actions.push({ label: t('provider.retry'), onClick: onRestart })
  }
  if (
    (issue === 'session_ended' ||
      issue === 'session_interrupted' ||
      issue === 'start_failed' ||
      issue === 'terminal_failed') &&
    onRestart
  ) {
    actions.push({ label: t('provider.restart'), onClick: onRestart })
  }
  if (
    (issue === 'restore_failed' ||
      issue === 'session_ended' ||
      issue === 'session_interrupted' ||
      issue === 'start_failed' ||
      issue === 'terminal_failed') &&
    onNewConversation
  ) {
    actions.push({ label: t('provider.newConversation'), onClick: onNewConversation })
  }

  return (
    <section
      className="agent-provider-status-panel__issue"
      data-tone={isNeutral ? 'neutral' : 'warning'}
    >
      <WorkbenchIcon role={iconRole} size={15} />
      <div>
        <p>{feedbackIssueLabel(issue, providerName, state, t)}</p>
        {actions.length > 0 ? (
          <div className="agent-provider-status-panel__actions">
            {actions.map((action) => (
              <button type="button" key={action.label} onClick={action.onClick}>
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function AgentProviderBlockingState({
  blocking,
  onRetryAttachment,
  onRetryInspection,
  providerName,
  state
}: {
  readonly blocking: AgentBlockingFeedback
  readonly onRetryAttachment?: () => void
  readonly onRetryInspection: () => void
  readonly providerName: string
  readonly state: AgentProviderPanelState
}) {
  const { t } = useI18n()
  const [isHelpVisible, setIsHelpVisible] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const availability = installableAvailability(state)
  const isChecking = blocking === 'checking_provider'
  const iconRole: WorkbenchIconRole = isChecking
    ? 'loading'
    : blocking === 'runtime_unavailable'
      ? 'runtime-unavailable'
      : availability
        ? 'download'
        : 'error'
  const canRetryAttachment = blocking === 'attachment_failed' && onRetryAttachment
  const canRetryInspection =
    blocking === 'provider_missing' ||
    blocking === 'provider_unavailable' ||
    blocking === 'provider_upgrade_required'

  const copyInstallCommand = async (): Promise<void> => {
    try {
      if (!navigator.clipboard || !availability?.installCommand) return
      await navigator.clipboard.writeText(availability.installCommand)
      setIsCopied(true)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <div
      className="agent-provider-empty-state"
      role="status"
      data-tone={isChecking ? 'neutral' : 'warning'}
    >
      <span className="agent-provider-empty-state__icon" aria-hidden="true">
        <WorkbenchIcon
          className={isChecking ? 'agent-provider-empty-state__spinner' : undefined}
          role={iconRole}
          size={18}
        />
      </span>
      <p>{blockingLabel(blocking, providerName, state, t)}</p>
      {canRetryAttachment || canRetryInspection || availability?.installCommand ? (
        <div className="agent-provider-empty-state__actions">
          {canRetryAttachment ? (
            <button
              type="button"
              aria-label={t('provider.retryAttach', { provider: providerName })}
              onClick={onRetryAttachment}
            >
              <WorkbenchIcon role="restart" size={13} />
              {t('provider.retry')}
            </button>
          ) : null}
          {canRetryInspection ? (
            <button
              type="button"
              aria-label={t('provider.recheck', { provider: providerName })}
              onClick={onRetryInspection}
            >
              <WorkbenchIcon role="restart" size={13} />
              {t('provider.recheckShort')}
            </button>
          ) : null}
          {availability?.installCommand ? (
            <button
              type="button"
              aria-expanded={isHelpVisible}
              onClick={() => setIsHelpVisible((visible) => !visible)}
            >
              {t('provider.installHelp')}
            </button>
          ) : null}
        </div>
      ) : null}
      {isHelpVisible && availability?.installCommand ? (
        <div className="agent-provider-empty-state__install-help">
          <code>{availability.installCommand}</code>
          <button
            type="button"
            aria-label={t('provider.copyInstallCommand')}
            onClick={() => void copyInstallCommand()}
          >
            {isCopied ? (
              <WorkbenchIcon role="confirm" size={13} />
            ) : (
              <WorkbenchIcon role="copy" size={13} />
            )}
            {isCopied ? t('provider.copied') : t('provider.copy')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

type Translate = ReturnType<typeof useI18n>['t']

function feedbackIssueLabel(
  issue: AgentFeedbackIssue,
  providerName: string,
  state: AgentProviderPanelState,
  t: Translate
): string {
  switch (issue) {
    case 'attachment_failed':
      return t('provider.attachFailed', { provider: providerName })
    case 'binding_save_failed':
      return t('provider.bindingSaveFailed')
    case 'restore_failed':
      return t('provider.restoreFailed')
    case 'session_ended':
      return t('provider.sessionEnded', { provider: providerName })
    case 'session_interrupted':
      return t('provider.sessionInterrupted', { provider: providerName })
    case 'start_failed':
    case 'terminal_failed':
      if (state.status === 'ready' && state.availability.status === 'missing') {
        return t('provider.startFailedMissing', { provider: providerName })
      }
      if (state.status === 'ready' && state.availability.status === 'upgrade_required') {
        return t('provider.startFailedUpgrade', {
          minimumVersion: state.availability.minimumVersion,
          provider: providerName
        })
      }
      return t('provider.startFailed', { provider: providerName })
  }
}

function blockingLabel(
  blocking: AgentBlockingFeedback,
  providerName: string,
  state: AgentProviderPanelState,
  t: Translate
): string {
  switch (blocking) {
    case 'attachment_failed':
      return t('provider.attachFailed', { provider: providerName })
    case 'checking_provider':
      return t('provider.checking', { provider: providerName })
    case 'provider_missing':
      return t('provider.missing', { provider: providerName })
    case 'provider_unavailable':
      return t('provider.checkUnavailable', { provider: providerName })
    case 'provider_upgrade_required':
      return state.status === 'ready' && state.availability.status === 'upgrade_required'
        ? t('provider.upgradeRequired', {
            minimumVersion: state.availability.minimumVersion,
            provider: providerName
          })
        : t('provider.startFailed', { provider: providerName })
    case 'runtime_unavailable':
      return t('provider.runtimeUnavailable')
  }
}

function installableAvailability(
  state: AgentProviderPanelState
):
  | Extract<AgentProviderAvailability, { readonly status: 'missing' }>
  | Extract<AgentProviderAvailability, { readonly status: 'upgrade_required' }>
  | null {
  if (
    state.status === 'ready' &&
    (state.availability.status === 'missing' || state.availability.status === 'upgrade_required')
  ) {
    return state.availability
  }
  return null
}
