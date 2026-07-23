import { AlertCircle, Bot, Check, LoaderCircle, PlugZap, RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'

import type { CreatableAgentProviderSnapshot } from '../../contexts/agent/application/dto/AgentProviderDiscoverySnapshot'
import { AgentProviderIcon } from './AgentProviderIcon'
import { useI18n } from './i18n/useI18n'
import { inertOutside, trapFocus } from './modalFocus'

export function AgentProviderPickerDialog({
  error,
  pendingProviderId,
  providers,
  onCancel,
  onRefresh,
  onSelect
}: {
  readonly error: 'creation' | 'discovery' | null
  readonly pendingProviderId: string | null
  readonly providers: readonly CreatableAgentProviderSnapshot[] | null
  readonly onCancel: () => void
  readonly onRefresh: () => void
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

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.contains(document.activeElement)) return
    dialog.focus()
  }, [providers])

  const isLoading = providers === null
  const isCreating = pendingProviderId !== null

  return (
    <div
      className="agent-provider-picker__backdrop"
      ref={backdropRef}
      onMouseDown={(event) => {
        if (!isCreating && event.currentTarget === event.target) onCancel()
      }}
    >
      <section
        aria-label={t('agent.providerPicker.dialog')}
        aria-modal="true"
        className="agent-provider-picker"
        onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, !isCreating, onCancel)}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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
        <div className="agent-provider-picker__body">
          {error ? (
            <div className="agent-provider-picker__error" role="alert">
              <AlertCircle aria-hidden="true" size={14} />
              <span>
                {t(
                  error === 'creation'
                    ? 'agent.providerPicker.creationFailed'
                    : 'agent.providerPicker.discoveryFailed'
                )}
              </span>
            </div>
          ) : null}
          {isLoading ? (
            <div className="agent-provider-picker__state" role="status">
              <LoaderCircle
                aria-hidden="true"
                className="agent-provider-picker__spinner"
                size={18}
              />
              <span>{t('agent.providerPicker.discovering')}</span>
            </div>
          ) : providers.length === 0 ? (
            <div className="agent-provider-picker__state">
              <strong>{t('agent.providerPicker.emptyTitle')}</strong>
              <span>{t('agent.providerPicker.emptyDescription')}</span>
            </div>
          ) : (
            <div className="agent-provider-picker__options">
              {providers.map((provider, index) => (
                <AgentProviderOption
                  autoFocus={index === 0}
                  disabled={isCreating}
                  isCreating={pendingProviderId === provider.descriptor.id}
                  key={provider.descriptor.id}
                  provider={provider}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
        <footer className="agent-provider-picker__footer">
          <span>{t('agent.providerPicker.fixedHint')}</span>
          <span className="agent-provider-picker__footer-actions">
            <button type="button" disabled={isLoading || isCreating} onClick={onRefresh}>
              <RefreshCw aria-hidden="true" size={12} />
              {t('agent.providerPicker.refresh')}
            </button>
            <button type="button" disabled={isCreating} onClick={onCancel}>
              {t('common.cancel')}
            </button>
          </span>
        </footer>
      </section>
    </div>
  )
}

function AgentProviderOption({
  autoFocus,
  disabled,
  isCreating,
  provider,
  onSelect
}: {
  readonly autoFocus: boolean
  readonly disabled: boolean
  readonly isCreating: boolean
  readonly provider: CreatableAgentProviderSnapshot
  readonly onSelect: (providerId: string) => void
}) {
  const { t } = useI18n()
  const descriptor = provider.descriptor
  const availabilityLabel = isCreating
    ? t('agent.providerPicker.creating')
    : provider.availability.version
  return (
    <button
      aria-label={`${descriptor.displayName} · ${availabilityLabel}`}
      autoFocus={autoFocus}
      className="agent-provider-picker__option"
      disabled={disabled}
      type="button"
      onClick={() => onSelect(descriptor.id)}
    >
      <span className="agent-provider-picker__option-icon" aria-hidden="true">
        <AgentProviderIcon icon={descriptor.icon} />
      </span>
      <span className="agent-provider-picker__option-copy">
        <span className="agent-provider-picker__option-title">
          <strong title={descriptor.displayName}>{descriptor.displayName}</strong>
          <small data-status="installed">{availabilityLabel}</small>
        </span>
        <span className="agent-provider-picker__capabilities">
          {descriptor.capabilities.resume ? (
            <span>
              <RotateCcw size={11} aria-hidden="true" />
              {t('agent.providerPicker.resume')}
            </span>
          ) : null}
          {descriptor.capabilities.cleancodeMcp !== 'unsupported' ? (
            <span>
              <PlugZap size={11} aria-hidden="true" />
              {t('agent.providerPicker.mcp')}
            </span>
          ) : null}
          {!descriptor.capabilities.resume &&
          descriptor.capabilities.cleancodeMcp === 'unsupported' ? (
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

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  canCancel: boolean,
  onCancel: () => void
): void {
  if (event.key === 'Escape') {
    event.stopPropagation()
    if (canCancel) onCancel()
    return
  }
  trapFocus(event, dialog)
}
