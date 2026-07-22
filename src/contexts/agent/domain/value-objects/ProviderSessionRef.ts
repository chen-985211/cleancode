import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface ProviderSessionRefSnapshot {
  readonly formatVersion: number
  readonly kind: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly value: string
}

export class ProviderSessionRef {
  private constructor(private readonly snapshot: ProviderSessionRefSnapshot) {}

  static create(input: ProviderSessionRefSnapshot): ProviderSessionRef {
    if (!Number.isSafeInteger(input.formatVersion) || input.formatVersion <= 0) {
      throw invalidProviderSessionRef('formatVersion')
    }

    const kind = requireSessionRefText(input.kind, 'kind', 100)
    const value = requireSessionRefText(input.value, 'value', 8_192)
    const metadata = copyMetadata(input.metadata)

    return new ProviderSessionRef({
      formatVersion: input.formatVersion,
      kind,
      ...(metadata ? { metadata } : {}),
      value
    })
  }

  get formatVersion(): number {
    return this.snapshot.formatVersion
  }

  get kind(): string {
    return this.snapshot.kind
  }

  get value(): string {
    return this.snapshot.value
  }

  toSnapshot(): ProviderSessionRefSnapshot {
    return {
      formatVersion: this.snapshot.formatVersion,
      kind: this.snapshot.kind,
      ...(this.snapshot.metadata ? { metadata: copyMetadata(this.snapshot.metadata) } : {}),
      value: this.snapshot.value
    }
  }
}

function requireSessionRefText(value: string, fieldName: string, maxLength: number): string {
  const normalized = value.trim()

  if (!normalized || normalized.length > maxLength || normalized.includes('\0')) {
    throw invalidProviderSessionRef(fieldName)
  }

  return normalized
}

function copyMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!metadata) return undefined

  let serialized: string | undefined
  try {
    serialized = JSON.stringify(metadata)
  } catch {
    throw invalidProviderSessionRef('metadata')
  }
  if (!serialized || serialized.length > 16_384) throw invalidProviderSessionRef('metadata')

  let copy: unknown
  try {
    copy = JSON.parse(serialized) as unknown
  } catch {
    throw invalidProviderSessionRef('metadata')
  }
  if (!isPlainRecord(copy)) throw invalidProviderSessionRef('metadata')
  return copy
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidProviderSessionRef(fieldName: string) {
  return createExpectedAppError(
    'AGENT_SESSION_INVALID',
    'Agent Provider session reference is invalid.',
    { fieldName }
  )
}
