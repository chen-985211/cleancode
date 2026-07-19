export const applicationShortcutCommands = [
  'openSettings',
  'createTerminal',
  'createAgent',
  'groupTerminals'
] as const

export type ApplicationShortcutCommand = (typeof applicationShortcutCommands)[number]

export type ShortcutPlatform = 'mac' | 'other'

export interface ApplicationShortcutBinding {
  readonly alt: boolean
  readonly key: string
  readonly primary: boolean
  readonly shift: boolean
}

export type ApplicationShortcutBindings = Readonly<
  Record<ApplicationShortcutCommand, ApplicationShortcutBinding | null>
>

export const defaultApplicationShortcutBindings = {
  openSettings: { alt: false, key: ',', primary: true, shift: false },
  createTerminal: { alt: false, key: 'T', primary: true, shift: true },
  createAgent: { alt: false, key: 'A', primary: true, shift: true },
  groupTerminals: { alt: false, key: 'G', primary: true, shift: true }
} as const satisfies ApplicationShortcutBindings

const unsupportedBindingKeys = new Set([
  'Alt',
  'AltGraph',
  'Backspace',
  'Control',
  'Delete',
  'Escape',
  'Meta',
  'Shift',
  'Tab'
])

function normalizeKey(key: string): string | null {
  if (!key || unsupportedBindingKeys.has(key)) {
    return null
  }

  if (key === ' ') {
    return 'Space'
  }

  return key.length === 1 ? key.toLocaleUpperCase('en-US') : key
}

export function resolveShortcutPlatform(platform = navigator.platform): ShortcutPlatform {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? 'mac' : 'other'
}

export function isApplicationShortcutBinding(value: unknown): value is ApplicationShortcutBinding {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<ApplicationShortcutBinding>
  return (
    typeof candidate.alt === 'boolean' &&
    typeof candidate.primary === 'boolean' &&
    typeof candidate.shift === 'boolean' &&
    typeof candidate.key === 'string' &&
    normalizeKey(candidate.key) === candidate.key &&
    (candidate.primary || candidate.alt)
  )
}

export function normalizeShortcutBinding(
  event: KeyboardEvent,
  platform: ShortcutPlatform
): ApplicationShortcutBinding | null {
  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey
  const unsupportedPrimary = platform === 'mac' ? event.ctrlKey : event.metaKey
  const key = normalizeKey(event.key)

  if (unsupportedPrimary || (!primary && !event.altKey) || key === null) {
    return null
  }

  return {
    alt: event.altKey,
    key,
    primary,
    shift: event.shiftKey
  }
}

export function formatShortcutBinding(
  binding: ApplicationShortcutBinding | null,
  platform: ShortcutPlatform
): string[] {
  if (binding === null) {
    return []
  }

  const labels: string[] = []
  if (binding.primary) {
    labels.push(platform === 'mac' ? '⌘' : 'Ctrl')
  }
  if (binding.alt) {
    labels.push(platform === 'mac' ? '⌥' : 'Alt')
  }
  if (binding.shift) {
    labels.push(platform === 'mac' ? '⇧' : 'Shift')
  }
  labels.push(binding.key)
  return labels
}

export function applicationShortcutBindingsEqual(
  left: ApplicationShortcutBinding | null,
  right: ApplicationShortcutBinding | null
): boolean {
  if (left === null || right === null) {
    return left === right
  }

  return (
    left.alt === right.alt &&
    left.key === right.key &&
    left.primary === right.primary &&
    left.shift === right.shift
  )
}

export function findShortcutConflict(
  bindings: ApplicationShortcutBindings,
  command: ApplicationShortcutCommand,
  proposedBinding: ApplicationShortcutBinding
): ApplicationShortcutCommand | null {
  return (
    applicationShortcutCommands.find(
      (candidate) =>
        candidate !== command &&
        applicationShortcutBindingsEqual(bindings[candidate], proposedBinding)
    ) ?? null
  )
}

export function matchesShortcutEvent(
  event: KeyboardEvent,
  binding: ApplicationShortcutBinding | null,
  platform: ShortcutPlatform
): boolean {
  if (binding === null) {
    return false
  }

  const primary = platform === 'mac' ? event.metaKey : event.ctrlKey
  const unsupportedPrimary = platform === 'mac' ? event.ctrlKey : event.metaKey
  return (
    !unsupportedPrimary &&
    primary === binding.primary &&
    event.altKey === binding.alt &&
    event.shiftKey === binding.shift &&
    normalizeKey(event.key) === binding.key
  )
}
