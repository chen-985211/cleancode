import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  AgentProviderAvailability,
  AgentProviderContribution,
  AgentProviderDescriptor
} from '../ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../domain/value-objects/ProviderSessionRef'

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

  parseSessionRef(providerId: string, sessionRef: ProviderSessionRefSnapshot): ProviderSessionRef {
    const codec = this.require(providerId).sessionRefCodec
    if (!codec) {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        `Agent Provider "${providerId}" does not support session references.`,
        { providerId }
      )
    }
    return ProviderSessionRef.create(codec.parse(sessionRef), providerId)
  }
}

function validateContribution(contribution: AgentProviderContribution): void {
  const { capabilities, id } = contribution.descriptor
  const telemetrySignals = contribution.telemetry?.signals ?? {
    activity: false,
    sessionIdentity: false
  }
  const supportsMcp = capabilities.cleancodeMcp !== 'unsupported'
  const invalid =
    !id ||
    id !== id.trim() ||
    !contribution.descriptor.displayName.trim() ||
    capabilities.resume !== Boolean(contribution.resume) ||
    telemetrySignals.activity !== capabilities.activityTracking ||
    telemetrySignals.sessionIdentity !== capabilities.sessionIdentityCapture ||
    supportsMcp !== Boolean(contribution.cleancodeCapability) ||
    capabilities.sessionRefCodec !== Boolean(contribution.sessionRefCodec) ||
    (capabilities.resume && !capabilities.sessionRefCodec) ||
    (capabilities.sessionIdentityCapture && !capabilities.sessionRefCodec) ||
    (capabilities.launchInstructions && !contribution.cleancodeCapability)

  if (invalid) {
    throw createExpectedAppError(
      'AGENT_PROVIDER_INVALID',
      `Agent Provider "${id || '<empty>'}" has an invalid capability contribution.`,
      { providerId: id || '<empty>' }
    )
  }
}
