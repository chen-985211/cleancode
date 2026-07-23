import { Check, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { AgentProviderDescriptor } from '../../contexts/agent/application/ports/AgentProviderContribution'
import { AgentProviderIcon } from './AgentProviderIcon'
import { useAgentProviderCatalog } from './useAgentProviderCatalog'
import { useAgentProviderState } from './useAgentProviderState'
import { useI18n } from './i18n/useI18n'

export function AgentSettingsPane({
  defaultProviderId,
  onRefresh,
  onDefaultProviderChange
}: {
  readonly defaultProviderId: string | null
  readonly onRefresh: () => Promise<void> | void
  readonly onDefaultProviderChange: (providerId: string) => void
}) {
  const { t } = useI18n()
  const catalog = useAgentProviderCatalog()
  const [refreshVersion, setRefreshVersion] = useState(0)

  return (
    <div className="agent-settings-pane">
      <header className="agent-settings-pane__header">
        <div>
          <h2>{t('settings.agents.title')}</h2>
          <p>{t('settings.agents.description')}</p>
        </div>
        <button
          className="agent-settings-refresh"
          disabled={catalog.status !== 'ready'}
          type="button"
          onClick={() => {
            setRefreshVersion((version) => version + 1)
            void onRefresh()
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {t('settings.agents.refresh')}
        </button>
      </header>
      {catalog.status === 'loading' ? (
        <div className="agent-settings-state" role="status">
          <LoaderCircle className="agent-settings-spinner" size={18} aria-hidden="true" />
          {t('settings.agents.loading')}
        </div>
      ) : catalog.status === 'unavailable' ? (
        <div className="agent-settings-state" role="status">
          {t('settings.agents.unavailable')}
        </div>
      ) : (
        <div className="agent-settings-list">
          {catalog.providers.map((provider) => (
            <AgentSettingsRow
              defaultProviderId={defaultProviderId}
              key={provider.id}
              provider={provider}
              refreshVersion={refreshVersion}
              onDefaultProviderChange={onDefaultProviderChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentSettingsRow({
  defaultProviderId,
  provider,
  refreshVersion,
  onDefaultProviderChange
}: {
  readonly defaultProviderId: string | null
  readonly provider: AgentProviderDescriptor
  readonly refreshVersion: number
  readonly onDefaultProviderChange: (providerId: string) => void
}) {
  const { t } = useI18n()
  const { retry, state } = useAgentProviderState(provider.id)
  const isInstalled = state.status === 'ready' && state.availability.status === 'installed'
  const isDefault = defaultProviderId === provider.id

  useEffect(() => {
    if (refreshVersion > 0) retry()
  }, [refreshVersion, retry])

  const status =
    state.status === 'checking'
      ? t('settings.agents.checking')
      : state.status === 'unavailable'
        ? t('settings.agents.runtimeUnavailable')
        : t(`settings.agents.status.${state.availability.status}`)

  return (
    <div className="agent-settings-row" data-default={isDefault || undefined}>
      <span className="agent-settings-row__icon" aria-hidden="true">
        <AgentProviderIcon icon={provider.icon} />
      </span>
      <span className="agent-settings-row__identity">
        <strong>{provider.displayName}</strong>
        <span className="agent-settings-row__status" data-installed={isInstalled || undefined}>
          {state.status === 'checking' ? (
            <LoaderCircle className="agent-settings-spinner" size={12} aria-hidden="true" />
          ) : null}
          {status}
        </span>
      </span>
      <span className="agent-settings-row__actions">
        {!isInstalled && provider.documentationUrl ? (
          <a href={provider.documentationUrl} rel="noreferrer" target="_blank">
            {t('settings.agents.configure')}
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}
        <button
          aria-pressed={isDefault}
          className="agent-settings-default"
          disabled={!isInstalled || isDefault}
          type="button"
          onClick={() => onDefaultProviderChange(provider.id)}
        >
          {isDefault ? <Check size={13} aria-hidden="true" /> : null}
          {t(isDefault ? 'settings.agents.default' : 'settings.agents.setDefault')}
        </button>
      </span>
    </div>
  )
}
