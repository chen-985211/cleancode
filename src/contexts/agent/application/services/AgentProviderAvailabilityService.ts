import type { AgentProviderAvailability } from '../ports/AgentProviderContribution'
import type {
  AgentProviderDetectionEnvironmentPort,
  PrepareAgentProviderDetectionEnvironmentOptions
} from '../ports/AgentProviderDetectionEnvironmentPort'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import type { CreatableAgentProviderSnapshot } from '../dto/AgentProviderDiscoverySnapshot'

export type InspectAgentProviderOptions = PrepareAgentProviderDetectionEnvironmentOptions

interface CachedInspection {
  pending: boolean
  readonly promise: Promise<AgentProviderAvailability>
}

interface CachedPreparation {
  pending: boolean
  readonly promise: Promise<void>
}

const inheritedDetectionEnvironment: AgentProviderDetectionEnvironmentPort = {
  prepare: async () => undefined
}

export class AgentProviderAvailabilityService {
  private readonly inspections = new Map<string, CachedInspection>()
  private preparation: CachedPreparation | null = null

  constructor(
    private readonly providers: AgentProviderRegistryPort,
    private readonly environment: AgentProviderDetectionEnvironmentPort = inheritedDetectionEnvironment
  ) {}

  async discoverCreatableProviders(
    options: InspectAgentProviderOptions = {}
  ): Promise<readonly CreatableAgentProviderSnapshot[]> {
    await this.prepareEnvironment(options)
    const descriptors = this.providers.listDescriptors()
    const availability = await Promise.all(
      descriptors.map((descriptor) => this.inspectPrepared(descriptor.id, options))
    )

    return descriptors.flatMap((descriptor, index) => {
      const providerAvailability = availability[index]
      return providerAvailability?.status === 'installed'
        ? [{ availability: providerAvailability, descriptor }]
        : []
    })
  }

  async inspect(
    providerId: string,
    options: InspectAgentProviderOptions = {}
  ): Promise<AgentProviderAvailability> {
    this.providers.require(providerId)
    await this.prepareEnvironment(options)
    return this.inspectPrepared(providerId, options)
  }

  private inspectPrepared(
    providerId: string,
    options: InspectAgentProviderOptions
  ): Promise<AgentProviderAvailability> {
    const cached = this.inspections.get(providerId)
    if (cached && (!options.refresh || cached.pending)) return cached.promise

    const entry: CachedInspection = {
      pending: true,
      promise: this.inspectSafely(providerId)
    }
    this.inspections.set(providerId, entry)
    void entry.promise.then(
      () => this.markInspectionSettled(providerId, entry),
      () => this.markInspectionSettled(providerId, entry)
    )
    return entry.promise
  }

  private async inspectSafely(providerId: string): Promise<AgentProviderAvailability> {
    try {
      const availability = await this.providers.inspect(providerId)
      if (availability.providerId !== providerId) {
        return temporarilyUnavailable(providerId, 'invalid_output')
      }
      return availability
    } catch {
      return temporarilyUnavailable(providerId, 'command_failed')
    }
  }

  private markInspectionSettled(providerId: string, entry: CachedInspection): void {
    if (this.inspections.get(providerId) === entry) entry.pending = false
  }

  private prepareEnvironment(options: InspectAgentProviderOptions): Promise<void> {
    const cached = this.preparation
    if (cached && (!options.refresh || cached.pending)) return cached.promise

    let preparation: Promise<void>
    try {
      preparation = Promise.resolve(this.environment.prepare(options))
    } catch {
      preparation = Promise.resolve()
    }
    const entry: CachedPreparation = {
      pending: true,
      promise: preparation.catch(() => undefined)
    }
    this.preparation = entry
    void entry.promise.then(() => {
      if (this.preparation === entry) entry.pending = false
    })
    return entry.promise
  }
}

function temporarilyUnavailable(
  providerId: string,
  reason: Extract<
    AgentProviderAvailability,
    { readonly status: 'temporarily_unavailable' }
  >['reason']
): AgentProviderAvailability {
  return {
    providerId,
    reason,
    status: 'temporarily_unavailable',
    version: null
  }
}
