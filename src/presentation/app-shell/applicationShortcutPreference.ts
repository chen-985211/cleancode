import {
  applicationShortcutCommands,
  applicationShortcutBindingsEqual,
  defaultApplicationShortcutBindings,
  isApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand
} from './applicationShortcuts'

export const shortcutBindingsStorageKey = 'cleancode:application-shortcut-bindings'

interface StoredApplicationShortcutBindings {
  readonly bindings: ApplicationShortcutBindings
  readonly version: 1
}

function hasCompleteBindingCatalog(value: unknown): value is ApplicationShortcutBindings {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate)
  return (
    keys.length === applicationShortcutCommands.length &&
    applicationShortcutCommands.every(
      (command) =>
        Object.hasOwn(candidate, command) &&
        (candidate[command] === null || isApplicationShortcutBinding(candidate[command]))
    )
  )
}

function hasShortcutConflict(bindings: ApplicationShortcutBindings): boolean {
  return applicationShortcutCommands.some((command, index) => {
    const binding = bindings[command]
    if (binding === null) {
      return false
    }

    return applicationShortcutCommands
      .slice(index + 1)
      .some((candidate) => applicationShortcutBindingsEqual(binding, bindings[candidate]))
  })
}

function cloneBindings(bindings: ApplicationShortcutBindings): ApplicationShortcutBindings {
  return Object.fromEntries(
    applicationShortcutCommands.map((command) => {
      const binding = bindings[command]
      return [command, binding === null ? null : { ...binding }]
    })
  ) as Record<ApplicationShortcutCommand, ApplicationShortcutBindings[ApplicationShortcutCommand]>
}

export function readApplicationShortcutBindings(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): ApplicationShortcutBindings {
  const stored = storage.getItem(shortcutBindingsStorageKey)
  if (stored === null) {
    return cloneBindings(defaultApplicationShortcutBindings)
  }

  try {
    const preference = JSON.parse(stored) as Partial<StoredApplicationShortcutBindings>
    if (
      preference.version !== 1 ||
      !hasCompleteBindingCatalog(preference.bindings) ||
      hasShortcutConflict(preference.bindings)
    ) {
      return cloneBindings(defaultApplicationShortcutBindings)
    }

    return cloneBindings(preference.bindings)
  } catch {
    return cloneBindings(defaultApplicationShortcutBindings)
  }
}

export function writeApplicationShortcutBindings(
  bindings: ApplicationShortcutBindings,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  const preference: StoredApplicationShortcutBindings = {
    bindings,
    version: 1
  }
  storage.setItem(shortcutBindingsStorageKey, JSON.stringify(preference))
}
