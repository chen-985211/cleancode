export type AgentPermissionMode = 'yolo' | 'manual'

export interface AgentProviderOverrideSnapshot {
  readonly argumentsText: string
  readonly environment: Record<string, string>
  readonly executable?: string
}

export interface AgentProviderPreferencesSnapshot {
  readonly defaultCleancodeMcpEnabled: boolean
  readonly defaultProviderId: string | null
  readonly disabledProviderIds: string[]
  readonly permissionMode: AgentPermissionMode
  readonly providerOverrides: Record<string, AgentProviderOverrideSnapshot>
  readonly version: 1
}

const providerIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/
const environmentNamePattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/

export class AgentProviderPreferences {
  private constructor(private snapshot: AgentProviderPreferencesSnapshot) {}

  static create(): AgentProviderPreferences {
    return new AgentProviderPreferences({
      defaultCleancodeMcpEnabled: true,
      defaultProviderId: null,
      disabledProviderIds: [],
      permissionMode: 'yolo',
      providerOverrides: {},
      version: 1
    })
  }

  static restore(input: unknown): AgentProviderPreferences {
    if (!isRecord(input) || input.version !== 1) return AgentProviderPreferences.create()
    const defaultProviderId = normalizeProviderId(input.defaultProviderId)
    const disabledProviderIds = normalizeProviderIds(input.disabledProviderIds)
    return new AgentProviderPreferences({
      defaultCleancodeMcpEnabled:
        typeof input.defaultCleancodeMcpEnabled === 'boolean'
          ? input.defaultCleancodeMcpEnabled
          : true,
      defaultProviderId:
        defaultProviderId && !disabledProviderIds.includes(defaultProviderId)
          ? defaultProviderId
          : null,
      disabledProviderIds,
      permissionMode: input.permissionMode === 'manual' ? 'manual' : 'yolo',
      providerOverrides: normalizeProviderOverrides(input.providerOverrides),
      version: 1
    })
  }

  setDefaultCleancodeMcpEnabled(enabled: boolean): void {
    this.snapshot = { ...this.snapshot, defaultCleancodeMcpEnabled: enabled }
  }

  setDefaultProvider(providerId: string | null): void {
    const normalized = normalizeProviderId(providerId)
    this.snapshot = {
      ...this.snapshot,
      defaultProviderId:
        normalized && !this.snapshot.disabledProviderIds.includes(normalized) ? normalized : null
    }
  }

  setPermissionMode(permissionMode: AgentPermissionMode): void {
    this.snapshot = { ...this.snapshot, permissionMode }
  }

  setProviderEnabled(providerId: string, enabled: boolean): void {
    const normalized = normalizeProviderId(providerId)
    if (!normalized) return
    const disabledProviderIds = enabled
      ? this.snapshot.disabledProviderIds.filter((candidate) => candidate !== normalized)
      : [...new Set([...this.snapshot.disabledProviderIds, normalized])]
    this.snapshot = {
      ...this.snapshot,
      defaultProviderId:
        !enabled && this.snapshot.defaultProviderId === normalized
          ? null
          : this.snapshot.defaultProviderId,
      disabledProviderIds
    }
  }

  setProviderOverride(providerId: string, override: AgentProviderOverrideSnapshot | null): void {
    const normalized = normalizeProviderId(providerId)
    if (!normalized) return
    const providerOverrides = { ...this.snapshot.providerOverrides }
    const normalizedOverride = normalizeProviderOverride(override)
    if (normalizedOverride) providerOverrides[normalized] = normalizedOverride
    else delete providerOverrides[normalized]
    this.snapshot = { ...this.snapshot, providerOverrides }
  }

  toSnapshot(): AgentProviderPreferencesSnapshot {
    return {
      ...this.snapshot,
      disabledProviderIds: [...this.snapshot.disabledProviderIds],
      providerOverrides: Object.fromEntries(
        Object.entries(this.snapshot.providerOverrides).map(([providerId, override]) => [
          providerId,
          {
            ...override,
            environment: { ...override.environment }
          }
        ])
      )
    }
  }
}

function normalizeProviderOverrides(value: unknown): Record<string, AgentProviderOverrideSnapshot> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([providerId, override]) => {
      const normalizedId = normalizeProviderId(providerId)
      const normalizedOverride = normalizeProviderOverride(override)
      return normalizedId && normalizedOverride ? [[normalizedId, normalizedOverride]] : []
    })
  )
}

function normalizeProviderOverride(value: unknown): AgentProviderOverrideSnapshot | null {
  if (!isRecord(value)) return null
  const executable =
    typeof value.executable === 'string' && value.executable.trim()
      ? value.executable.trim().slice(0, 2_048)
      : undefined
  const argumentsText =
    typeof value.argumentsText === 'string' ? value.argumentsText.trim().slice(0, 8_192) : ''
  const environment = normalizeEnvironment(value.environment)
  if (!executable && !argumentsText && Object.keys(environment).length === 0) return null
  return {
    argumentsText,
    environment,
    ...(executable ? { executable } : {})
  }
}

function normalizeEnvironment(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([name, environmentValue]) =>
      name === name.trim() &&
      environmentNamePattern.test(name) &&
      typeof environmentValue === 'string' &&
      environmentValue.length <= 8_192
        ? [[name, environmentValue]]
        : []
    )
  )
}

function normalizeProviderIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((candidate) => normalizeProviderId(candidate) ?? []))]
}

function normalizeProviderId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return providerIdPattern.test(normalized) ? normalized : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
