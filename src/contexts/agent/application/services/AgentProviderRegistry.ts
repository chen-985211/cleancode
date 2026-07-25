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
  const capturesSessionIdentity =
    telemetrySignals.sessionIdentity || Boolean(contribution.freshSession)
  const supportsMcp = capabilities.cleancodeMcp
  const invalid =
    !id ||
    id !== id.trim() ||
    !contribution.descriptor.displayName.trim() ||
    !isValidProviderIcon(icon) ||
    capabilities.resume !== Boolean(contribution.resume) ||
    telemetrySignals.activity !== capabilities.activityTracking ||
    capturesSessionIdentity !== capabilities.sessionIdentityCapture ||
    supportsMcp !== Boolean(contribution.cleancodeCapability) ||
    capabilities.sessionRefCodec !== Boolean(contribution.sessionRefCodec) ||
    (capabilities.resume && !capabilities.sessionRefCodec) ||
    (capabilities.sessionIdentityCapture && !capabilities.sessionRefCodec) ||
    (contribution.freshSession && !contribution.sessionRefCodec) ||
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

  const gradientIds = validateLinearGradients(icon.linearGradients)
  if (gradientIds === null) return false

  return icon.paths.every((path) => {
    if (!path || typeof path !== 'object' || typeof path.d !== 'string') return false
    const { d, fill, fillRule, transform } = path
    const normalizedPath = d.trim()
    return (
      normalizedPath.length > 0 &&
      normalizedPath.length <= 8192 &&
      /^[MmZzLlHhVvCcSsQqTtAaEe0-9+\-.,\s]+$/.test(normalizedPath) &&
      isValidPathFill(fill, gradientIds) &&
      (fillRule === undefined || fillRule === 'evenodd' || fillRule === 'nonzero') &&
      isValidPathTransform(transform)
    )
  })
}

function validateLinearGradients(
  gradients: Extract<
    AgentProviderDescriptor['icon'],
    { readonly paths: unknown }
  >['linearGradients']
): ReadonlySet<string> | null {
  if (gradients === undefined) return new Set()
  if (!Array.isArray(gradients) || gradients.length === 0 || gradients.length > 8) return null

  const ids = new Set<string>()
  for (const gradient of gradients) {
    if (!gradient || typeof gradient !== 'object') return null
    const { id, stops, x1, x2, y1, y2 } = gradient
    if (
      typeof id !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(id) ||
      ids.has(id) ||
      ![x1, x2, y1, y2].every(isValidSvgCoordinate) ||
      !Array.isArray(stops) ||
      stops.length < 2 ||
      stops.length > 8 ||
      !stops.every(
        (stop) =>
          Boolean(stop) &&
          typeof stop === 'object' &&
          isValidGradientOffset(stop.offset) &&
          isValidCssColor(stop.stopColor)
      )
    ) {
      return null
    }
    ids.add(id)
  }
  return ids
}

function isValidPathFill(fill: unknown, gradientIds: ReadonlySet<string>): boolean {
  if (fill === undefined || fill === 'currentColor') return true
  if (typeof fill !== 'string') return false
  if (/^#[0-9a-fA-F]{6}$/.test(fill)) return true
  const gradientReference = fill.match(/^url\(#([A-Za-z][A-Za-z0-9_-]{0,31})\)$/)
  return Boolean(gradientReference?.[1] && gradientIds.has(gradientReference[1]))
}

function isValidPathTransform(transform: unknown): boolean {
  if (transform === undefined) return true
  return (
    typeof transform === 'string' &&
    transform.length <= 256 &&
    /^(?:(?:matrix|rotate|scale|skewX|skewY|translate)\([0-9eE+\-.,\s]+\)\s*)+$/.test(transform)
  )
}

function isValidSvgCoordinate(value: unknown): value is string {
  return typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(value)
}

function isValidGradientOffset(value: unknown): boolean {
  if (!isValidSvgCoordinate(value)) return false
  const numericValue = Number.parseFloat(value)
  return value.endsWith('%')
    ? numericValue >= 0 && numericValue <= 100
    : numericValue >= 0 && numericValue <= 1
}

function isValidCssColor(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (value === 'currentColor' ||
      /^#[0-9a-fA-F]{6}$/.test(value) ||
      /^(?:hsl|hsla|oklch|rgb|rgba)\([0-9.%+\-,\s/]+\)$/.test(value))
  )
}
