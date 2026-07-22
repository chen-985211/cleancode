import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, Copy, Download, Loader2, MonitorOff, RefreshCw } from 'lucide-react'

import type { AgentRuntimeSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { AgentProviderAvailability } from '../../contexts/agent/application/ports/AgentProviderContribution'
import type { AgentAttachOperation } from './useAgentSessionAttachment'
import type { AgentProviderPanelState } from './useAgentProviderState'
import { useI18n } from './i18n/useI18n'

export function AgentProviderStatusView({
  attachment = { status: 'idle' },
  onNewConversation,
  onRetryAttachment,
  onRetryInspection,
  onRetryRestore,
  providerName,
  runtime,
  state
}: {
  readonly attachment?: AgentAttachOperation
  readonly onNewConversation?: () => void
  readonly onRetryAttachment?: () => void
  readonly onRetryInspection: () => void
  readonly onRetryRestore?: () => void
  readonly providerName: string
  readonly runtime: AgentRuntimeSnapshot | null
  readonly state: AgentProviderPanelState
}) {
  const { t } = useI18n()
  if (runtime?.terminal.status === 'suspended') return null

  if (attachment.status === 'failed') {
    return (
      <RuntimeNotice label={t('provider.attachFailed', { provider: providerName })} tone="warning">
        <span className="agent-runtime-notice__actions">
          <button
            type="button"
            aria-label={t('provider.retryAttach', { provider: providerName })}
            onClick={onRetryAttachment}
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>{t('provider.retry')}</span>
          </button>
        </span>
      </RuntimeNotice>
    )
  }
  if (attachment.status === 'pending') {
    return (
      <RuntimeNotice
        label={t('provider.connecting', { provider: providerName })}
        tone="neutral"
        icon="checking"
      />
    )
  }
  if (attachment.status === 'measuring' && !runtime) {
    return <RuntimeNotice label={t('provider.preparingTerminal')} tone="neutral" icon="checking" />
  }

  if (runtime?.launch.status === 'failed' && runtime.launch.failureKind === 'restore') {
    return (
      <RuntimeNotice label={t('provider.restoreFailed')} tone="warning">
        <span className="agent-runtime-notice__actions">
          {onRetryRestore ? (
            <button type="button" onClick={onRetryRestore}>
              {t('provider.retry')}
            </button>
          ) : null}
          <button type="button" onClick={onNewConversation}>
            {t('provider.newConversation')}
          </button>
        </span>
      </RuntimeNotice>
    )
  }
  if (
    runtime?.terminal.status === 'running' &&
    (runtime.launch.status === 'exited' || runtime.launch.status === 'stopped')
  ) {
    return (
      <RuntimeNotice label={t('provider.sessionEnded', { provider: providerName })} tone="neutral">
        <span className="agent-runtime-notice__actions">
          {onRetryRestore ? (
            <button type="button" onClick={onRetryRestore}>
              {t('provider.restart')}
            </button>
          ) : null}
          <button type="button" onClick={onNewConversation}>
            {t('provider.newConversation')}
          </button>
        </span>
      </RuntimeNotice>
    )
  }
  if (
    runtime?.terminal.status === 'failed' ||
    runtime?.terminal.status === 'exited' ||
    runtime?.launch.status === 'failed'
  ) {
    if (state.status === 'ready' && state.availability.status === 'missing') {
      return (
        <InstallCliNotice
          availability={state.availability}
          label={t('provider.startFailedMissing', { provider: providerName })}
          onRetry={onRetryInspection}
          providerName={providerName}
        />
      )
    }
    if (state.status === 'ready' && state.availability.status === 'upgrade_required') {
      return (
        <InstallCliNotice
          availability={state.availability}
          label={t('provider.startFailedUpgrade', {
            minimumVersion: state.availability.minimumVersion,
            provider: providerName
          })}
          onRetry={onRetryInspection}
          providerName={providerName}
        />
      )
    }
    return (
      <RuntimeNotice label={t('provider.startFailed', { provider: providerName })} tone="warning" />
    )
  }
  if (runtime?.mcp.status === 'failed') {
    return <RuntimeNotice label={t('provider.mcpUnavailable')} tone="warning" />
  }
  if (runtime?.binding.status === 'persistence_failed') {
    return <RuntimeNotice label={t('provider.bindingSaveFailed')} tone="warning" />
  }
  if (runtime?.mcp.status === 'initializing' && runtime.launch.status === 'launching') {
    return <RuntimeNotice label={t('provider.mcpInitializing')} tone="neutral" icon="checking" />
  }
  if (runtime) return null
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
  if (state.availability.status === 'upgrade_required') {
    return (
      <InstallCliNotice
        availability={state.availability}
        label={t('provider.upgradeRequired', {
          minimumVersion: state.availability.minimumVersion,
          provider: providerName
        })}
        onRetry={onRetryInspection}
        providerName={providerName}
      />
    )
  }
  if (state.availability.status === 'missing') {
    return (
      <InstallCliNotice
        availability={state.availability}
        onRetry={onRetryInspection}
        providerName={providerName}
      />
    )
  }
  return null
}

function InstallCliNotice({
  availability,
  label,
  onRetry,
  providerName
}: {
  readonly availability:
    | Extract<AgentProviderAvailability, { readonly status: 'missing' }>
    | Extract<AgentProviderAvailability, { readonly status: 'upgrade_required' }>
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
