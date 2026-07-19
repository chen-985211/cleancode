import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, Copy, Download, Loader2, MonitorOff, RefreshCw } from 'lucide-react'

import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'
import type { CodexCliInstallationSnapshot } from '../../contexts/agent/application/ports/CodexCliPort'
import type { CodexCliPanelState } from './useCodexCliState'
import { useI18n } from './i18n/useI18n'

export function CodexCliStatusView({
  onNewConversation,
  onRetryInspection,
  onRetryRestore,
  state,
  sessionStatus
}: {
  readonly onNewConversation?: () => void
  readonly onRetryInspection: () => void
  readonly onRetryRestore?: () => void
  readonly state: CodexCliPanelState
  readonly sessionStatus: AgentSessionSnapshot['status'] | null
}) {
  const { t } = useI18n()
  if (sessionStatus === 'running' || sessionStatus === 'suspended') return null

  if (sessionStatus === 'restore_failed') {
    return (
      <RuntimeNotice label={t('codex.restoreFailed')} tone="warning">
        <span className="agent-runtime-notice__actions">
          <button type="button" onClick={onRetryRestore}>
            {t('codex.retry')}
          </button>
          <button type="button" onClick={onNewConversation}>
            {t('codex.newConversation')}
          </button>
        </span>
      </RuntimeNotice>
    )
  }

  if (sessionStatus === 'exited') {
    return <RuntimeNotice label={t('codex.sessionEnded')} tone="neutral" />
  }

  if (sessionStatus === 'failed') {
    if (state.status === 'ready' && state.installation.status === 'missing') {
      return (
        <MissingCliNotice
          installation={state.installation}
          label={t('codex.startFailedMissing')}
          onRetry={onRetryInspection}
        />
      )
    }

    return <RuntimeNotice label={t('codex.startFailed')} tone="warning" />
  }

  if (state.status === 'unavailable') {
    return <RuntimeNotice label={t('codex.runtimeUnavailable')} tone="neutral" icon="offline" />
  }

  if (state.status === 'checking') {
    return state.visible ? (
      <RuntimeNotice label={t('codex.checking')} tone="neutral" icon="checking" />
    ) : null
  }

  if (state.installation.status === 'temporarily_unavailable') {
    return (
      <RuntimeNotice label={t('codex.checkUnavailable')} tone="neutral">
        <span className="agent-runtime-notice__actions">
          <RetryInspectionButton onRetry={onRetryInspection} />
        </span>
      </RuntimeNotice>
    )
  }

  if (state.installation.status === 'missing') {
    return <MissingCliNotice installation={state.installation} onRetry={onRetryInspection} />
  }

  return null
}

function MissingCliNotice({
  installation,
  label,
  onRetry
}: {
  readonly installation: Extract<CodexCliInstallationSnapshot, { readonly status: 'missing' }>
  readonly label?: string
  readonly onRetry: () => void
}) {
  const { t } = useI18n()
  const [isHelpVisible, setIsHelpVisible] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const copyInstallCommand = async (): Promise<void> => {
    try {
      if (!navigator.clipboard) return
      await navigator.clipboard.writeText(installation.installCommand)
      setIsCopied(true)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <div className="agent-runtime-notice" role="status" data-tone="warning">
      <Download size={14} aria-hidden="true" />
      <span>{label ?? t('codex.missing')}</span>
      <span className="agent-runtime-notice__actions">
        <RetryInspectionButton onRetry={onRetry} />
        <button
          type="button"
          aria-expanded={isHelpVisible}
          onClick={() => setIsHelpVisible((visible) => !visible)}
        >
          {t('codex.installHelp')}
        </button>
      </span>
      {isHelpVisible ? (
        <span className="agent-runtime-notice__install-help">
          <code>{installation.installCommand}</code>
          <button
            type="button"
            aria-label={t('codex.copyInstallCommand')}
            onClick={() => void copyInstallCommand()}
          >
            {isCopied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
            <span>{isCopied ? t('codex.copied') : t('codex.copy')}</span>
          </button>
        </span>
      ) : null}
    </div>
  )
}

function RetryInspectionButton({ onRetry }: { readonly onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <button type="button" aria-label={t('codex.recheck')} onClick={onRetry}>
      <RefreshCw size={12} aria-hidden="true" />
      <span>{t('codex.recheckShort')}</span>
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
