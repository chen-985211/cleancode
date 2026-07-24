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

const v2ApplicationShortcutCommands = [
  'openSettings',
  'toggleSidebar',
  'createTerminal',
  'createAgent',
  'groupTerminals'
] as const

const v3ApplicationShortcutCommands = [
  'openSettings',
  'toggleSidebar',
  'createTerminal',
  'createAgent',
  'groupTerminals',
  'zoomCanvasIn',
  'zoomCanvasOut',
  'fitCanvas'
] as const

const v4ApplicationShortcutCommands = [
  'openSettings',
  'toggleSidebar',
  'addProject',
  'createBranchWorkspace',
  'previousWorkspace',
  'nextWorkspace',
  'createTerminal',
  'createAgent',
  'groupTerminals',
  'panCanvasLeft',
  'panCanvasRight',
  'panCanvasUp',
  'panCanvasDown',
  'zoomCanvasIn',
  'zoomCanvasOut',
  'fitCanvas',
  'toggleMinimap'
] as const

type ShortcutBindingCatalog = Readonly<Record<string, ApplicationShortcutBinding | null>>

interface StoredApplicationShortcutBindings {
  readonly bindings: ApplicationShortcutBindings
  readonly version: 6
}

const v5CanvasZoomDefaultBindings = {
  zoomCanvasIn: { alt: false, key: '=', primary: true, shift: false },
  zoomCanvasOut: { alt: false, key: '-', primary: true, shift: false },
  fitCanvas: { alt: false, key: '0', primary: true, shift: false }
} as const satisfies Pick<
  ApplicationShortcutBindings,
  'fitCanvas' | 'zoomCanvasIn' | 'zoomCanvasOut'
>

const changedCanvasZoomDefaultCommands = ['zoomCanvasIn', 'zoomCanvasOut', 'fitCanvas'] as const

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

function migrateCanvasZoomDefaults(
  bindings: ApplicationShortcutBindings
): ApplicationShortcutBindings {
  const migrated: Record<string, ApplicationShortcutBinding | null> = cloneBindings(bindings)

  for (const command of changedCanvasZoomDefaultCommands) {
    if (
      !applicationShortcutBindingsEqual(bindings[command], v5CanvasZoomDefaultBindings[command])
    ) {
      continue
    }

    const nextDefault = defaultApplicationShortcutBindings[command]
    const conflictsWithPreservedBinding = applicationShortcutCommands.some(
      (candidate) =>
        candidate !== command &&
        migrated[candidate] !== null &&
        applicationShortcutBindingsEqual(migrated[candidate], nextDefault)
    )
    migrated[command] = conflictsWithPreservedBinding ? null : { ...nextDefault }
  }

  return cloneBindings(migrated)
}

function extendLegacyBindings(
  bindings: ShortcutBindingCatalog,
  preservedCommands: readonly string[]
): ApplicationShortcutBindings {
  const migrated: Record<string, ApplicationShortcutBinding | null> = {}

  for (const command of preservedCommands) {
    migrated[command] = bindings[command] ?? null
  }

  for (const command of applicationShortcutCommands) {
    if (Object.hasOwn(migrated, command)) {
      continue
    }

    const defaultBinding = defaultApplicationShortcutBindings[command]
    const conflictsWithPreservedBinding =
      defaultBinding !== null &&
      Object.values(migrated).some(
        (binding) => binding !== null && applicationShortcutBindingsEqual(binding, defaultBinding)
      )
    migrated[command] = conflictsWithPreservedBinding ? null : defaultBinding
  }

  return cloneBindings(migrated)
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
      preference.version === 6 &&
      hasCompleteBindingCatalog(preference.bindings, applicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, applicationShortcutCommands)
    ) {
      return cloneBindings(preference.bindings)
    }

    if (
      preference.version === 5 &&
      hasCompleteBindingCatalog(preference.bindings, applicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, applicationShortcutCommands)
    ) {
      return migrateCanvasZoomDefaults(cloneBindings(preference.bindings))
    }

    if (
      preference.version === 4 &&
      hasCompleteBindingCatalog(preference.bindings, v4ApplicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, v4ApplicationShortcutCommands)
    ) {
      return migrateCanvasZoomDefaults(
        cloneBindings({
          ...preference.bindings,
          selectCanvasNodeLeft: preference.bindings.panCanvasLeft,
          selectCanvasNodeRight: preference.bindings.panCanvasRight,
          selectCanvasNodeUp: preference.bindings.panCanvasUp,
          selectCanvasNodeDown: preference.bindings.panCanvasDown
        })
      )
    }

    if (
      preference.version === 3 &&
      hasCompleteBindingCatalog(preference.bindings, v3ApplicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, v3ApplicationShortcutCommands)
    ) {
      return migrateCanvasZoomDefaults(
        extendLegacyBindings(preference.bindings, v3ApplicationShortcutCommands)
      )
    }

    if (
      preference.version === 2 &&
      hasCompleteBindingCatalog(preference.bindings, v2ApplicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, v2ApplicationShortcutCommands)
    ) {
      return extendLegacyBindings(preference.bindings, v2ApplicationShortcutCommands)
    }

    if (
      preference.version === 1 &&
      hasCompleteBindingCatalog(preference.bindings, legacyApplicationShortcutCommands) &&
      !hasShortcutConflict(preference.bindings, legacyApplicationShortcutCommands)
    ) {
      const migratedBindings = {
        openSettings: preference.bindings.openSettings,
        toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
        createTerminal: preference.bindings.createTerminal,
        createAgent: preference.bindings.createAgent,
        groupTerminals: preference.bindings.groupTerminals
      }

      if (!hasShortcutConflict(migratedBindings, v2ApplicationShortcutCommands)) {
        return extendLegacyBindings(migratedBindings, v2ApplicationShortcutCommands)
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
    version: 6
  }
  storage.setItem(shortcutBindingsStorageKey, JSON.stringify(preference))
}
