import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowCounterClockwise'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise'
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown'
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { CircleNotchIcon } from '@phosphor-icons/react/dist/csr/CircleNotch'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import type {
  AgentProviderAvailability,
  AgentProviderDescriptor
} from '../../application/ports/AgentProviderContribution'
import type { UpdateAgentProviderPreferencesCommand } from '../../application/use-cases/UpdateAgentProviderPreferencesUseCase'
import type {
  AgentProviderOverrideSnapshot,
  AgentProviderPreferencesSnapshot
} from '../../domain/aggregates/AgentProviderPreferences'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import { ApplicationSettingsSwitch } from '../../../../presentation/shared/components/ApplicationSettingsSwitch'
import {
  useSelectionFeedbackMotion,
  useSelectionIndicatorMotion
} from '../../../../presentation/shared/hooks/useSelectionMotion'
import { AgentProviderIcon } from './AgentProviderIcon'
import { useAgentProviderCatalog } from '../view-models/useAgentProviderCatalog'

const defaultPreferences: AgentProviderPreferencesSnapshot = {
  defaultCleancodeMcpEnabled: true,
  defaultProviderId: null,
  disabledProviderIds: [],
  permissionMode: 'yolo',
  providerOverrides: {},
  version: 1
}

type InspectionState =
  | { readonly status: 'checking' }
  | { readonly availability: AgentProviderAvailability; readonly status: 'ready' }
  | { readonly status: 'unavailable' }

export function AgentSettingsPane({
  defaultProviderId,
  preferences = defaultPreferences,
  preferencesStatus = 'ready',
  onRefresh,
  onPreferencesChange
}: {
  readonly defaultProviderId: string | null
  readonly preferences?: AgentProviderPreferencesSnapshot
  readonly preferencesStatus?: 'loading' | 'ready' | 'unavailable'
  readonly onRefresh: () => Promise<void> | void
  readonly onPreferencesChange: (
    command: UpdateAgentProviderPreferencesCommand
  ) => Promise<void> | void
}) {
  const { t } = useI18n()
  const catalog = useAgentProviderCatalog()
  const [inspections, setInspections] = useState<Record<string, InspectionState>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingPreference, setPendingPreference] = useState<string | null>(null)
  const [permissionSelectionContainerRef, permissionSelectionIndicatorRef] =
    useSelectionIndicatorMotion(preferences.permissionMode)

  const inspectProviders = useCallback(
    async (providers: readonly AgentProviderDescriptor[]): Promise<void> => {
      const inspect = window.cleancode?.inspectAgentProvider
      if (!inspect) {
        setInspections(
          Object.fromEntries(
            providers.map((provider) => [provider.id, { status: 'unavailable' } as const])
          )
        )
        return
      }
      setInspections(
        Object.fromEntries(
          providers.map((provider) => [provider.id, { status: 'checking' } as const])
        )
      )
      const results = await Promise.all(
        providers.map(async (provider): Promise<readonly [string, InspectionState]> => {
          try {
            return [
              provider.id,
              {
                availability: await inspect({ providerId: provider.id }),
                status: 'ready'
              }
            ]
          } catch {
            return [provider.id, { status: 'unavailable' }]
          }
        })
      )
      setInspections(Object.fromEntries(results))
    },
    []
  )

  useEffect(() => {
    if (catalog.status !== 'ready') return undefined
    const timeout = window.setTimeout(() => void inspectProviders(catalog.providers), 0)
    return () => window.clearTimeout(timeout)
  }, [catalog, inspectProviders])

  const updatePreferences = useCallback(
    async (key: string, command: UpdateAgentProviderPreferencesCommand): Promise<void> => {
      setPendingPreference(key)
      try {
        await onPreferencesChange(command)
      } finally {
        setPendingPreference(null)
      }
    },
    [onPreferencesChange]
  )

  const groups = useMemo(() => {
    if (catalog.status !== 'ready') return { available: [], installed: [] }
    return catalog.providers.reduce<{
      available: AgentProviderDescriptor[]
      installed: AgentProviderDescriptor[]
    }>(
      (result, provider) => {
        const inspection = inspections[provider.id]
        if (inspection?.status === 'ready' && inspection.availability.status === 'installed') {
          result.installed.push(provider)
        } else {
          result.available.push(provider)
        }
        return result
      },
      { available: [], installed: [] }
    )
  }, [catalog, inspections])

  const settingsDisabled = preferencesStatus !== 'ready' || pendingPreference !== null

  return (
    <div className="agent-settings-pane">
      <header className="agent-settings-pane__header">
        <h2>{t('settings.agents.title')}</h2>
      </header>

      <section className="agent-settings-preferences" aria-label={t('settings.agents.preferences')}>
        <div className="agent-settings-preference-row">
          <span>
            <strong>{t('settings.agents.permission')}</strong>
          </span>
          <div
            ref={permissionSelectionContainerRef}
            className="agent-settings-segmented"
            role="group"
          >
            <span
              ref={permissionSelectionIndicatorRef}
              className="selection-motion-indicator agent-settings-segmented__selection"
              data-selection-motion-target={preferences.permissionMode}
              aria-hidden="true"
            />
            {(['yolo', 'manual'] as const).map((mode) => (
              <button
                aria-pressed={preferences.permissionMode === mode}
                data-selection-motion-option={mode}
                disabled={settingsDisabled}
                key={mode}
                type="button"
                onClick={() => void updatePreferences('permissionMode', { permissionMode: mode })}
              >
                {t(`settings.agents.permission.${mode}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="agent-settings-preference-row">
          <span>
            <strong>{t('settings.agents.defaultMcp')}</strong>
          </span>
          <ApplicationSettingsSwitch
            checked={preferences.defaultCleancodeMcpEnabled}
            label={t('settings.agents.defaultMcp')}
            disabled={settingsDisabled}
            onClick={() =>
              void updatePreferences('defaultCleancodeMcpEnabled', {
                defaultCleancodeMcpEnabled: !preferences.defaultCleancodeMcpEnabled
              })
            }
          />
        </div>
      </section>

      {catalog.status === 'loading' ? (
        <div className="agent-settings-state" role="status">
          <CircleNotchIcon
            className="agent-settings-spinner"
            size={18}
            weight="bold"
            aria-hidden="true"
          />
          {t('settings.agents.loading')}
        </div>
      ) : catalog.status === 'unavailable' ? (
        <div className="agent-settings-state" role="status">
          {t('settings.agents.unavailable')}
        </div>
      ) : (
        <div className="agent-settings-catalog">
          <AgentSettingsSectionHeader
            count={groups.installed.length}
            title={t('settings.agents.installed')}
          >
            <button
              className="agent-settings-refresh"
              disabled={isRefreshing}
              type="button"
              onClick={async () => {
                setIsRefreshing(true)
                try {
                  await Promise.all([inspectProviders(catalog.providers), onRefresh()])
                } finally {
                  setIsRefreshing(false)
                }
              }}
            >
              <ArrowsClockwiseIcon
                className={isRefreshing ? 'agent-settings-spinner' : undefined}
                size={13}
                weight="bold"
                aria-hidden="true"
              />
              {t('settings.agents.refresh')}
            </button>
          </AgentSettingsSectionHeader>
          <div className="agent-settings-list">
            {groups.installed.length === 0 ? (
              <div className="agent-settings-list__empty">{t('settings.agents.noneInstalled')}</div>
            ) : (
              groups.installed.map((provider) => (
                <InstalledAgentSettingsRow
                  defaultProviderId={defaultProviderId}
                  key={provider.id}
                  pendingPreference={pendingPreference}
                  preferences={preferences}
                  provider={provider}
                  onPreferencesChange={updatePreferences}
                />
              ))
            )}
          </div>

          <AgentSettingsSectionHeader
            count={groups.available.length}
            title={t('settings.agents.available')}
          />
          <div className="agent-settings-list agent-settings-list--available">
            {groups.available.map((provider) => (
              <AvailableAgentSettingsRow
                inspection={inspections[provider.id]}
                key={provider.id}
                provider={provider}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AgentSettingsSectionHeader({
  children,
  count,
  title
}: {
  readonly children?: ReactNode
  readonly count: number
  readonly title: string
}) {
  return (
    <header className="agent-settings-section-header">
      <h3>
        {title}
        <span>{count}</span>
      </h3>
      {children}
    </header>
  )
}

function InstalledAgentSettingsRow({
  defaultProviderId,
  pendingPreference,
  preferences,
  provider,
  onPreferencesChange
}: {
  readonly defaultProviderId: string | null
  readonly pendingPreference: string | null
  readonly preferences: AgentProviderPreferencesSnapshot
  readonly provider: AgentProviderDescriptor
  readonly onPreferencesChange: (
    key: string,
    command: UpdateAgentProviderPreferencesCommand
  ) => Promise<void>
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const disabled = preferences.disabledProviderIds.includes(provider.id)
  const isDefault = defaultProviderId === provider.id
  const launchSummary = formatLaunchSummary(provider, preferences)
  const enabledSelectionMotionRef = useSelectionFeedbackMotion(!disabled)
  const defaultSelectionMotionRef = useSelectionFeedbackMotion(isDefault)
  const expandedSelectionMotionRef = useSelectionFeedbackMotion(expanded)

  return (
    <article
      ref={defaultSelectionMotionRef}
      className="agent-settings-row"
      data-default={isDefault || undefined}
      data-disabled={disabled || undefined}
    >
      <div className="agent-settings-row__main">
        <span className="agent-settings-row__icon" aria-hidden="true">
          <AgentProviderIcon icon={provider.icon} />
        </span>
        <span className="agent-settings-row__identity">
          <strong>{provider.displayName}</strong>
          <code title={launchSummary}>{launchSummary}</code>
        </span>
        <span className="agent-settings-row__actions">
          <button
            ref={enabledSelectionMotionRef}
            aria-checked={!disabled}
            aria-label={t('settings.agents.enableAgent', { agent: provider.displayName })}
            className="agent-settings-enabled"
            disabled={pendingPreference !== null}
            role="switch"
            type="button"
            onClick={() =>
              void onPreferencesChange(`enabled:${provider.id}`, {
                disabledProviderIds: disabled
                  ? preferences.disabledProviderIds.filter((id) => id !== provider.id)
                  : [...preferences.disabledProviderIds, provider.id]
              })
            }
          >
            <span>{t(disabled ? 'settings.agents.disabled' : 'settings.agents.enabled')}</span>
          </button>
          <button
            aria-pressed={isDefault}
            className="agent-settings-default"
            disabled={disabled || isDefault || pendingPreference !== null}
            type="button"
            onClick={() =>
              void onPreferencesChange(`default:${provider.id}`, {
                defaultProviderId: provider.id
              })
            }
          >
            {isDefault ? <CheckIcon size={12} weight="bold" aria-hidden="true" /> : null}
            {t(isDefault ? 'settings.agents.default' : 'settings.agents.setDefault')}
          </button>
          <ProviderDocumentationLink provider={provider} />
          {provider.launch ? (
            <button
              ref={expandedSelectionMotionRef}
              aria-expanded={expanded}
              aria-label={t('settings.agents.editLaunch', { agent: provider.displayName })}
              className="agent-settings-expand"
              type="button"
              onClick={() => setExpanded((value) => !value)}
            >
              <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      {expanded && provider.launch ? (
        <AgentLaunchConfigurationEditor
          pendingPreference={pendingPreference}
          preferences={preferences}
          provider={provider}
          onPreferencesChange={onPreferencesChange}
        />
      ) : null}
    </article>
  )
}

function AvailableAgentSettingsRow({
  inspection,
  provider
}: {
  readonly inspection: InspectionState | undefined
  readonly provider: AgentProviderDescriptor
}) {
  const { t } = useI18n()
  const status =
    !inspection || inspection.status === 'checking'
      ? t('settings.agents.checking')
      : inspection.status === 'unavailable'
        ? t('settings.agents.runtimeUnavailable')
        : t(`settings.agents.status.${inspection.availability.status}`)

  return (
    <article className="agent-settings-row agent-settings-row--available">
      <div className="agent-settings-row__main">
        <span className="agent-settings-row__icon" aria-hidden="true">
          <AgentProviderIcon icon={provider.icon} />
        </span>
        <span className="agent-settings-row__identity">
          <strong>{provider.displayName}</strong>
          <span className="agent-settings-row__status">
            {inspection?.status === 'checking' ? (
              <CircleNotchIcon
                className="agent-settings-spinner"
                size={11}
                weight="bold"
                aria-hidden="true"
              />
            ) : null}
            {status}
          </span>
        </span>
        <span className="agent-settings-row__actions">
          <ProviderDocumentationLink provider={provider} showLabel />
        </span>
      </div>
    </article>
  )
}

function AgentLaunchConfigurationEditor({
  pendingPreference,
  preferences,
  provider,
  onPreferencesChange
}: {
  readonly pendingPreference: string | null
  readonly preferences: AgentProviderPreferencesSnapshot
  readonly provider: AgentProviderDescriptor
  readonly onPreferencesChange: (
    key: string,
    command: UpdateAgentProviderPreferencesCommand
  ) => Promise<void>
}) {
  const { t } = useI18n()
  const launch = provider.launch!
  const override = preferences.providerOverrides[provider.id]
  const [executable, setExecutable] = useState(override?.executable ?? launch.executable)
  const [argumentsText, setArgumentsText] = useState(override?.argumentsText ?? '')
  const [environmentText, setEnvironmentText] = useState(
    formatEnvironment(override?.environment ?? {})
  )
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    const environment = parseEnvironment(environmentText)
    if (!environment) {
      setError(t('settings.agents.environmentInvalid'))
      return
    }
    setError(null)
    const nextOverride: AgentProviderOverrideSnapshot = {
      argumentsText,
      environment,
      ...(executable.trim() && executable.trim() !== launch.executable
        ? { executable: executable.trim() }
        : {})
    }
    await onPreferencesChange(`override:${provider.id}`, {
      providerOverrides: {
        ...preferences.providerOverrides,
        [provider.id]: nextOverride
      }
    })
  }

  const reset = async (): Promise<void> => {
    const providerOverrides = { ...preferences.providerOverrides }
    delete providerOverrides[provider.id]
    setError(null)
    await onPreferencesChange(`override:${provider.id}`, { providerOverrides })
    setExecutable(launch.executable)
    setArgumentsText('')
    setEnvironmentText('')
  }

  return (
    <div className="agent-settings-launch-editor">
      <label>
        <span>{t('settings.agents.executable')}</span>
        <input
          spellCheck={false}
          value={executable}
          onChange={(event) => setExecutable(event.target.value)}
        />
      </label>
      <label>
        <span>{t('settings.agents.arguments')}</span>
        <input
          placeholder={launch.defaultArguments.join(' ')}
          spellCheck={false}
          value={argumentsText}
          onChange={(event) => setArgumentsText(event.target.value)}
        />
      </label>
      <label>
        <span>{t('settings.agents.environment')}</span>
        <textarea
          placeholder={formatEnvironment(launch.defaultEnvironment)}
          rows={Math.max(2, Math.min(5, environmentText.split('\n').length))}
          spellCheck={false}
          value={environmentText}
          onChange={(event) => setEnvironmentText(event.target.value)}
        />
      </label>
      <p>{t('settings.agents.launchHint')}</p>
      {error ? <div className="agent-settings-launch-editor__error">{error}</div> : null}
      <div className="agent-settings-launch-editor__actions">
        <button disabled={pendingPreference !== null} type="button" onClick={() => void reset()}>
          <ArrowCounterClockwiseIcon size={12} weight="bold" aria-hidden="true" />
          {t('settings.agents.resetLaunch')}
        </button>
        <button
          className="agent-settings-launch-editor__save"
          disabled={pendingPreference !== null}
          type="button"
          onClick={() => void save()}
        >
          {t('settings.agents.saveLaunch')}
        </button>
      </div>
    </div>
  )
}

function ProviderDocumentationLink({
  provider,
  showLabel = false
}: {
  readonly provider: AgentProviderDescriptor
  readonly showLabel?: boolean
}) {
  const { t } = useI18n()
  if (!provider.documentationUrl) return null
  return (
    <a
      aria-label={t('settings.agents.openDocumentation', { agent: provider.displayName })}
      className="agent-settings-documentation"
      href={provider.documentationUrl}
      rel="noreferrer"
      target="_blank"
    >
      {showLabel ? t('settings.agents.installGuide') : null}
      <ArrowSquareOutIcon size={13} weight="bold" aria-hidden="true" />
    </a>
  )
}

function formatLaunchSummary(
  provider: AgentProviderDescriptor,
  preferences: AgentProviderPreferencesSnapshot
): string {
  const launch = provider.launch
  if (!launch) return provider.id
  const override = preferences.providerOverrides[provider.id]
  const permissionArguments =
    preferences.permissionMode === 'yolo' ? (launch.permission?.arguments ?? []) : []
  return [
    override?.executable ?? launch.executable,
    ...launch.defaultArguments,
    ...permissionArguments,
    override?.argumentsText ?? ''
  ]
    .filter(Boolean)
    .join(' ')
}

function formatEnvironment(environment: Readonly<Record<string, string>>): string {
  return Object.entries(environment)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
}

function parseEnvironment(value: string): Record<string, string> | null {
  const environment: Record<string, string> = {}
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const separator = line.indexOf('=')
    const name = separator < 0 ? '' : line.slice(0, separator).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return null
    environment[name] = line.slice(separator + 1)
  }
  return environment
}
