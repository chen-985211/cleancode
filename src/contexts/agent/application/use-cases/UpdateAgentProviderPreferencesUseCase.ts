import type {
  AgentPermissionMode,
  AgentProviderOverrideSnapshot,
  AgentProviderPreferencesSnapshot
} from '../../domain/aggregates/AgentProviderPreferences'
import { AgentProviderPreferences } from '../../domain/aggregates/AgentProviderPreferences'
import type { AgentProviderPreferencesRepository } from '../ports/AgentProviderPreferencesRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'

export interface UpdateAgentProviderPreferencesCommand {
  readonly defaultCleancodeMcpEnabled?: boolean
  readonly defaultProviderId?: string | null
  readonly disabledProviderIds?: readonly string[]
  readonly permissionMode?: AgentPermissionMode
  readonly providerOverrides?: Readonly<Record<string, AgentProviderOverrideSnapshot>>
}

export class UpdateAgentProviderPreferencesUseCase {
  constructor(
    private readonly repository: AgentProviderPreferencesRepository,
    private readonly providers: AgentProviderRegistryPort
  ) {}

  async execute(
    command: UpdateAgentProviderPreferencesCommand
  ): Promise<AgentProviderPreferencesSnapshot> {
    this.validateProviderIds(command)
    const current = await this.repository.load()
    const preferences = AgentProviderPreferences.restore({ ...current, ...command, version: 1 })
    const snapshot = preferences.toSnapshot()
    await this.repository.save(snapshot)
    return snapshot
  }

  private validateProviderIds(command: UpdateAgentProviderPreferencesCommand): void {
    if (command.defaultProviderId) this.providers.require(command.defaultProviderId)
    for (const providerId of command.disabledProviderIds ?? []) this.providers.require(providerId)
    for (const providerId of Object.keys(command.providerOverrides ?? {})) {
      this.providers.require(providerId)
    }
  }
}
