import { Bot, Check, PlugZap, RotateCcw, TerminalSquare } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'

import type { AgentProviderDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'
import { useAgentProviderState } from './useAgentProviderState'
import { useI18n } from './i18n/useI18n'
import { inertOutside, trapFocus } from './modalFocus'

export function AgentProviderPickerDialog({
  providers,
  onCancel,
  onSelect
}: {
  readonly providers: readonly AgentProviderDescriptor[]
  readonly onCancel: () => void
  readonly onSelect: (providerId: string) => void
}) {
  const { t } = useI18n()
  const backdropRef = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )

  useEffect(() => {
    const backdrop = backdropRef.current
    if (!backdrop) return undefined
    const returnFocus = returnFocusRef.current
    const restoreBackground = inertOutside(backdrop)
    return () => {
      restoreBackground()
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [])

  return (
    <div
      className="agent-provider-picker__backdrop"
      ref={backdropRef}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onCancel()
      }}
    >
      <section
        aria-label={t('agent.providerPicker.dialog')}
        aria-modal="true"
        className="agent-provider-picker"
        onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
        ref={dialogRef}
        role="dialog"
      >
        <header className="agent-provider-picker__header">
          <span className="agent-provider-picker__icon" aria-hidden="true">
            <Bot size={17} />
          </span>
          <span>
            <strong>{t('agent.providerPicker.title')}</strong>
            <small>{t('agent.providerPicker.description')}</small>
          </span>
        </header>
        <div className="agent-provider-picker__options">
          {providers.map((provider, index) => (
            <AgentProviderOption
              autoFocus={index === 0}
              key={provider.id}
              provider={provider}
              onSelect={onSelect}
            />
          ))}
        </div>
        <footer className="agent-provider-picker__footer">
          <span>{t('agent.providerPicker.fixedHint')}</span>
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </footer>
      </section>
    </div>
  )
}

function AgentProviderOption({
  autoFocus,
  provider,
  onSelect
}: {
  readonly autoFocus: boolean
  readonly provider: AgentProviderDescriptor
  readonly onSelect: (providerId: string) => void
}) {
  const { t } = useI18n()
  const { state } = useAgentProviderState(provider.id)
  const availabilityLabel = resolveAvailabilityLabel(state, provider.displayName, t)
  return (
    <button
      aria-label={`${provider.displayName} · ${availabilityLabel}`}
      autoFocus={autoFocus}
      className="agent-provider-picker__option"
      type="button"
      onClick={() => onSelect(provider.id)}
    >
      <span className="agent-provider-picker__option-icon" aria-hidden="true">
        <TerminalSquare size={17} />
      </span>
      <span className="agent-provider-picker__option-copy">
        <span className="agent-provider-picker__option-title">
          <strong title={provider.displayName}>{provider.displayName}</strong>
          <small data-status={readAvailabilityTone(state)}>{availabilityLabel}</small>
        </span>
        <span className="agent-provider-picker__capabilities">
          {provider.capabilities.resume ? (
            <span>
              <RotateCcw size={11} aria-hidden="true" />
              {t('agent.providerPicker.resume')}
            </span>
          ) : null}
          {provider.capabilities.cleancodeMcp !== 'unsupported' ? (
            <span>
              <PlugZap size={11} aria-hidden="true" />
              {t('agent.providerPicker.mcp')}
            </span>
          ) : null}
          {!provider.capabilities.resume && provider.capabilities.cleancodeMcp === 'unsupported' ? (
            <span>
              <Check size={11} aria-hidden="true" />
              {t('agent.providerPicker.terminal')}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  )
}

function resolveAvailabilityLabel(
  state: ReturnType<typeof useAgentProviderState>['state'],
  providerName: string,
  t: ReturnType<typeof useI18n>['t']
): string {
  if (state.status === 'checking') return t('agent.providerPicker.checking')
  if (state.status === 'unavailable') return t('agent.providerPicker.unknown')
  if (state.availability.status === 'installed') return state.availability.version
  if (state.availability.status === 'missing') {
    return t('agent.providerPicker.notInstalled', { provider: providerName })
  }
  if (state.availability.status === 'upgrade_required') {
    return t('agent.providerPicker.upgradeRequired', {
      minimumVersion: state.availability.minimumVersion,
      provider: providerName
    })
  }
  return t('agent.providerPicker.unknown')
}

function readAvailabilityTone(
  state: ReturnType<typeof useAgentProviderState>['state']
): 'checking' | 'installed' | 'unavailable' {
  if (state.status !== 'ready') return state.status === 'checking' ? 'checking' : 'unavailable'
  return state.availability.status === 'installed' ? 'installed' : 'unavailable'
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  onCancel: () => void
): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    onCancel()
    return
  }
  trapFocus(event, dialog)
}
