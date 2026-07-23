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
  const { capabilities, icon, id } = contribution.descriptor
  const telemetrySignals = contribution.telemetry?.signals ?? {
    activity: false,
    sessionIdentity: false
  }
  const supportsMcp = capabilities.cleancodeMcp !== 'unsupported'
  const invalid =
    !id ||
    id !== id.trim() ||
    !contribution.descriptor.displayName.trim() ||
    !isValidProviderIcon(icon) ||
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

function isValidProviderIcon(icon: AgentProviderDescriptor['icon'] | undefined): boolean {
  if (!icon || typeof icon !== 'object') return false
  if ('imageDataUrl' in icon) {
    const prefix = 'data:image/png;base64,'
    const imageDataUrl = icon.imageDataUrl
    const payload = typeof imageDataUrl === 'string' ? imageDataUrl.slice(prefix.length) : ''
    return (
      icon.imageType === 'png' &&
      typeof imageDataUrl === 'string' &&
      imageDataUrl.startsWith(`${prefix}iVBORw0KGgo`) &&
      payload.length >= 16 &&
      payload.length <= 65_536 &&
      payload.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(payload)
    )
  }
  if (typeof icon.viewBox !== 'string') return false
  const viewBox = icon.viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  if (
    viewBox.length !== 4 ||
    viewBox.some((value) => !Number.isFinite(value)) ||
    (viewBox[2] ?? 0) <= 0 ||
    (viewBox[3] ?? 0) <= 0
  ) {
    return false
  }
  if (!Array.isArray(icon.paths) || icon.paths.length === 0 || icon.paths.length > 16) return false

  return icon.paths.every((path) => {
    if (!path || typeof path !== 'object' || typeof path.d !== 'string') return false
    const { d, fill, fillRule } = path
    const normalizedPath = d.trim()
    return (
      normalizedPath.length > 0 &&
      normalizedPath.length <= 8192 &&
      /^[MmZzLlHhVvCcSsQqTtAaEe0-9+\-.,\s]+$/.test(normalizedPath) &&
      (fill === undefined || fill === 'currentColor' || /^#[0-9a-fA-F]{6}$/.test(fill)) &&
      (fillRule === undefined || fillRule === 'evenodd' || fillRule === 'nonzero')
    )
  })
}
