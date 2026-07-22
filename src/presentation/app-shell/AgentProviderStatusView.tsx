import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, Copy, Download, Loader2, MonitorOff, RefreshCw } from 'lucide-react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { AgentProviderAvailability } from '../../contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderPanelState } from './useAgentProviderState'
import { useI18n } from './i18n/useI18n'

export function AgentProviderStatusView({
  onNewConversation,
  onRetryInspection,
  onRetryRestore,
  providerName,
  state,
  sessionStatus
}: {
  readonly onNewConversation?: () => void
  readonly onRetryInspection: () => void
  readonly onRetryRestore?: () => void
  readonly providerName: string
  readonly state: AgentProviderPanelState
  readonly sessionStatus: AgentSessionSnapshot['status'] | null
}) {
  const { t } = useI18n()
  if (sessionStatus === 'running' || sessionStatus === 'suspended') return null

  if (sessionStatus === 'restore_failed') {
    return (
      <RuntimeNotice label={t('provider.restoreFailed')} tone="warning">
        <span className="agent-runtime-notice__actions">
          <button type="button" onClick={onRetryRestore}>
            {t('provider.retry')}
          </button>
          <button type="button" onClick={onNewConversation}>
            {t('provider.newConversation')}
          </button>
        </span>
      </RuntimeNotice>
    )
  }
  if (sessionStatus === 'exited') {
    return (
      <RuntimeNotice label={t('provider.sessionEnded', { provider: providerName })} tone="neutral">
        <span className="agent-runtime-notice__actions">
          <button type="button" onClick={onRetryRestore}>
            {t('provider.restart')}
          </button>
          <button type="button" onClick={onNewConversation}>
            {t('provider.newConversation')}
          </button>
        </span>
      </RuntimeNotice>
    )
  }
  if (sessionStatus === 'failed') {
    if (state.status === 'ready' && state.availability.status === 'missing') {
      return (
        <MissingCliNotice
          availability={state.availability}
          label={t('provider.startFailedMissing', { provider: providerName })}
          onRetry={onRetryInspection}
          providerName={providerName}
        />
      )
    }
    return (
      <RuntimeNotice label={t('provider.startFailed', { provider: providerName })} tone="warning" />
    )
  }
  if (state.status === 'unavailable') {
    return <RuntimeNotice label={t('provider.runtimeUnavailable')} tone="neutral" icon="offline" />
  }
  if (state.status === 'checking') {
    return state.visible ? (
      <RuntimeNotice
        label={t('provider.checking', { provider: providerName })}
        tone="neutral"
        icon="checking"
      />
    ) : null
  }
  if (state.availability.status === 'temporarily_unavailable') {
    return (
      <RuntimeNotice
        label={t('provider.checkUnavailable', { provider: providerName })}
        tone="neutral"
      >
        <span className="agent-runtime-notice__actions">
          <RetryInspectionButton onRetry={onRetryInspection} providerName={providerName} />
        </span>
      </RuntimeNotice>
    )
  }
  if (state.availability.status === 'missing') {
    return (
      <MissingCliNotice
        availability={state.availability}
        onRetry={onRetryInspection}
        providerName={providerName}
      />
    )
  }
  return null
}

function MissingCliNotice({
  availability,
  label,
  onRetry,
  providerName
}: {
  readonly availability: Extract<AgentProviderAvailability, { readonly status: 'missing' }>
  readonly label?: string
  readonly onRetry: () => void
  readonly providerName: string
}) {
  const { t } = useI18n()
  const [isHelpVisible, setIsHelpVisible] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const copyInstallCommand = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(availability.installCommand)
      setIsCopied(true)
    } catch {
      setIsCopied(false)
    }
  }
  return (
    <div className="agent-runtime-notice" role="status" data-tone="warning">
      <Download size={14} aria-hidden="true" />
      <span>{label ?? t('provider.missing', { provider: providerName })}</span>
      <span className="agent-runtime-notice__actions">
        <RetryInspectionButton onRetry={onRetry} providerName={providerName} />
        <button
          type="button"
          aria-expanded={isHelpVisible}
          onClick={() => setIsHelpVisible((visible) => !visible)}
        >
          {t('provider.installHelp')}
        </button>
      </span>
      {isHelpVisible ? (
        <span className="agent-runtime-notice__install-help">
          <code>{availability.installCommand}</code>
          <button
            type="button"
            aria-label={t('provider.copyInstallCommand')}
            onClick={() => void copyInstallCommand()}
          >
            {isCopied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
            <span>{isCopied ? t('provider.copied') : t('provider.copy')}</span>
          </button>
        </span>
      ) : null}
    </div>
  )
}

function RetryInspectionButton({
  onRetry,
  providerName
}: {
  readonly onRetry: () => void
  readonly providerName: string
}) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      aria-label={t('provider.recheck', { provider: providerName })}
      onClick={onRetry}
    >
      <RefreshCw size={12} aria-hidden="true" />
      <span>{t('provider.recheckShort')}</span>
    </button>
  )
}

function RuntimeNotice({
  children,
  icon = 'alert',
  label,
  tone
}: {
  readonly children?: ReactNode
  readonly icon?: 'alert' | 'checking' | 'offline'
  readonly label: string
  readonly tone: 'neutral' | 'warning'
}) {
  const Icon = icon === 'checking' ? Loader2 : icon === 'offline' ? MonitorOff : CircleAlert
  return (
    <div
      className={`agent-runtime-notice${icon === 'checking' ? ' agent-runtime-notice--checking' : ''}`}
      role="status"
      data-tone={tone}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
      {children}
    </div>
  )
}
