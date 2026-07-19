import {
  applicationShortcutCommands,
  applicationShortcutBindingsEqual,
  defaultApplicationShortcutBindings,
  isApplicationShortcutBinding,
  type ApplicationShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand
} from './applicationShortcuts'

export const shortcutBindingsStorageKey = 'cleancode:application-shortcut-bindings'

const legacyApplicationShortcutCommands = [
  'openSettings',
  'createTerminal',
  'createAgent',
  'groupTerminals'
] as const

type ShortcutBindingCatalog = Readonly<Record<string, ApplicationShortcutBinding | null>>

interface StoredApplicationShortcutBindings {
  readonly bindings: ApplicationShortcutBindings
  readonly version: 2
}

function hasCompleteBindingCatalog(
  value: unknown,
  commands: readonly string[]
): value is ShortcutBindingCatalog {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate)
  return (
    keys.length === commands.length &&
    commands.every(
      (command) =>
        Object.hasOwn(candidate, command) &&
        (candidate[command] === null || isApplicationShortcutBinding(candidate[command]))
    )
  )
}

function hasShortcutConflict(
  bindings: ShortcutBindingCatalog,
  commands: readonly string[]
): boolean {
  return commands.some((command, index) => {
    const binding = bindings[command]
    if (binding === null) {
      return false
    }

    return commands
      .slice(index + 1)
      .some((candidate) => applicationShortcutBindingsEqual(binding, bindings[candidate]))
  })
}

function cloneBindings(bindings: ShortcutBindingCatalog): ApplicationShortcutBindings {
  return Object.fromEntries(
    applicationShortcutCommands.map((command) => {
      const binding = bindings[command]
      return [command, binding === null ? null : { ...binding }]
    })
  ) as Record<ApplicationShortcutCommand, ApplicationShortcutBindings[ApplicationShortcutCommand]>
}

function defaultBindings(): ApplicationShortcutBindings {
  return cloneBindings(defaultApplicationShortcutBindings)
}

export function readApplicationShortcutBindings(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): ApplicationShortcutBindings {
  const stored = storage.getItem(shortcutBindingsStorageKey)
  if (stored === null) {
    return defaultBindings()
  }

  try {
    const preference = JSON.parse(stored) as {
      readonly bindings?: unknown
      readonly version?: unknown
    }
    if (
      preference.version === 2 &&
      hasCompleteBindingCatalog(preference.bindings, applicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, applicationShortcutCommands)
    ) {
      return cloneBindings(preference.bindings)
    }

    if (
      preference.version === 1 &&
      hasCompleteBindingCatalog(preference.bindings, legacyApplicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, legacyApplicationShortcutCommands)
    ) {
      const migratedBindings: ApplicationShortcutBindings = {
        openSettings: preference.bindings.openSettings,
        toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
        createTerminal: preference.bindings.createTerminal,
        createAgent: preference.bindings.createAgent,
        groupTerminals: preference.bindings.groupTerminals
      }

      if (!hasShortcutConflict(migratedBindings, applicationShortcutCommands)) {
        return cloneBindings(migratedBindings)
      }
    }

    return defaultBindings()
  } catch {
    return defaultBindings()
  }
}

export function writeApplicationShortcutBindings(
  bindings: ApplicationShortcutBindings,
  storage: Pick<Storage, 'setItem'> = window.localStorage
): void {
  const preference: StoredApplicationShortcutBindings = {
    bindings,
    version: 2
  }
  storage.setItem(shortcutBindingsStorageKey, JSON.stringify(preference))
}
