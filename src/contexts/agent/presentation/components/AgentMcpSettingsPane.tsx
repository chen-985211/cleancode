import { useRef, useState } from 'react'
import { agentMcpToolCatalog } from '../../application/dto/AgentMcpToolCatalog'
import { defaultAgentProviderPreferences } from '../../application/dto/AgentProviderPreferencesDefaults'
import type { UpdateAgentProviderPreferencesCommand } from '../../application/use-cases/UpdateAgentProviderPreferencesUseCase'
import type { AgentProviderPreferencesSnapshot } from '../../domain/aggregates/AgentProviderPreferences'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { ApplicationSettingsSwitch } from '../../../../presentation/shared/components/ApplicationSettingsSwitch'
import { AgentMcpToolCategory } from './AgentMcpToolCategory'

export function AgentMcpSettingsPane({
  preferences = defaultAgentProviderPreferences,
  preferencesStatus = 'ready',
  onPreferencesChange
}: {
  readonly preferences?: AgentProviderPreferencesSnapshot
  readonly preferencesStatus?: 'loading' | 'ready' | 'unavailable'
  readonly onPreferencesChange: (
    command: UpdateAgentProviderPreferencesCommand
  ) => Promise<void> | void
}) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const disabled = pending || preferencesStatus !== 'ready'
  async function update(command: UpdateAgentProviderPreferencesCommand): Promise<void> {
    if (disabled || pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setFailed(false)
    try {
      await onPreferencesChange(command)
    } catch {
      setFailed(true)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return (
    <div className="mcp-settings-pane" aria-busy={pending}>
      <header className="mcp-settings-pane__header">
        <h2>{t('settings.mcp.title')}</h2>
      </header>
      <div className="mcp-settings-default">
        <strong>{t('settings.agents.defaultMcp')}</strong>
        <ApplicationSettingsSwitch
          checked={preferences.defaultCleancodeMcpEnabled}
          disabled={preferencesStatus !== 'ready'}
          aria-disabled={pending || undefined}
          label={t('settings.agents.defaultMcp')}
          onClick={() =>
            void update({ defaultCleancodeMcpEnabled: !preferences.defaultCleancodeMcpEnabled })
          }
        />
      </div>
      {preferencesStatus !== 'ready' ? (
        <p className="mcp-settings-hint" role="status">
          {t(preferencesStatus === 'loading' ? 'settings.mcp.loading' : 'settings.mcp.unavailable')}
        </p>
      ) : null}
      {failed ? (
        <p className="mcp-settings-error" role="alert">
          {t('settings.mcp.saveFailed')}
        </p>
      ) : null}
      {agentMcpToolCatalog.map((category) => (
        <AgentMcpToolCategory
          key={category.id}
          category={category}
          checked={preferences.mcpToolCategories[category.id]}
          disabled={preferencesStatus !== 'ready'}
          pending={pending}
          onToggle={() =>
            void update({
              mcpToolCategories: {
                ...preferences.mcpToolCategories,
                [category.id]: !preferences.mcpToolCategories[category.id]
              }
            })
          }
        />
      ))}
    </div>
  )
}
