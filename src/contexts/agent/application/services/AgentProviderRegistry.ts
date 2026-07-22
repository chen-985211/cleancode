import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentProviderAvailability,
  AgentProviderContribution,
  AgentProviderDescriptor
} from '../ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'

export class AgentProviderRegistry implements AgentProviderRegistryPort {
  private readonly contributions = new Map<string, AgentProviderContribution>()

  constructor(contributions: readonly AgentProviderContribution[]) {
    for (const contribution of contributions) {
      validateContribution(contribution)
      const providerId = contribution.descriptor.id
      if (this.contributions.has(providerId)) {
        throw createExpectedAppError(
          'AGENT_PROVIDER_DUPLICATE',
          `Agent Provider "${providerId}" is registered more than once.`,
          { providerId }
        )
      }
      this.contributions.set(providerId, contribution)
    }
  }

  listDescriptors(): readonly AgentProviderDescriptor[] {
    return [...this.contributions.values()].map(({ descriptor }) => descriptor)
  }

  require(providerId: string): AgentProviderContribution {
    const contribution = this.contributions.get(providerId)
    if (!contribution) {
      throw createExpectedAppError(
        'AGENT_PROVIDER_NOT_FOUND',
        `Agent Provider "${providerId}" is not registered.`,
        { providerId }
      )
    }
    return contribution
  }

  inspect(providerId: string): Promise<AgentProviderAvailability> {
    return this.require(providerId).detector.inspect()
  }
}

function validateContribution(contribution: AgentProviderContribution): void {
  const { capabilities, id } = contribution.descriptor
  const invalid =
    !id ||
    id !== id.trim() ||
    !contribution.descriptor.displayName.trim() ||
    capabilities.resume !== Boolean(contribution.resume) ||
    capabilities.structuredLifecycle !== Boolean(contribution.telemetry) ||
    capabilities.cleancodeMcp !== Boolean(contribution.cleancodeCapability) ||
    (capabilities.systemInstructions && !contribution.cleancodeCapability)

  if (invalid) {
    throw createExpectedAppError(
      'AGENT_PROVIDER_INVALID',
      `Agent Provider "${id || '<empty>'}" has an invalid capability contribution.`,
      { providerId: id || '<empty>' }
    )
  }
}
