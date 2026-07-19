import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcuts'
import {
  readApplicationShortcutBindings,
  shortcutBindingsStorageKey,
  writeApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcutPreference'

describe('application shortcut preference', () => {
  beforeEach(() => window.localStorage.clear())

  it('uses the complete default catalog when no preference exists', () => {
    expect(readApplicationShortcutBindings()).toEqual(defaultApplicationShortcutBindings)
  })

  it('restores customized and cleared bindings', () => {
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      createAgent: { alt: true, key: 'A', primary: true, shift: false },
      groupTerminals: null
    }

    writeApplicationShortcutBindings(bindings)

    expect(readApplicationShortcutBindings()).toEqual(bindings)
  })

  it('migrates the four-command v1 catalog and preserves valid custom bindings', () => {
    const legacyBindings = {
      openSettings: { alt: true, key: ',', primary: true, shift: false },
      createTerminal: null,
      createAgent: { alt: false, key: 'N', primary: true, shift: true },
      groupTerminals: { alt: true, key: 'G', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: legacyBindings, version: 1 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...legacyBindings,
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar
    })
  })

  it('writes the complete catalog with preference schema v2', () => {
    writeApplicationShortcutBindings(defaultApplicationShortcutBindings)

    expect(JSON.parse(window.localStorage.getItem(shortcutBindingsStorageKey) ?? '')).toEqual({
      bindings: defaultApplicationShortcutBindings,
      version: 2
    })
  })

  it('falls back atomically when a v1 custom binding conflicts with the new sidebar default', () => {
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({
        bindings: {
          openSettings: { alt: false, key: 'B', primary: true, shift: false },
          createTerminal: defaultApplicationShortcutBindings.createTerminal,
          createAgent: defaultApplicationShortcutBindings.createAgent,
          groupTerminals: defaultApplicationShortcutBindings.groupTerminals
        },
        version: 1
      })
    )

    expect(readApplicationShortcutBindings()).toEqual(defaultApplicationShortcutBindings)
  })

  it.each([
    'not-json',
    JSON.stringify({ version: 2, bindings: {} }),
    JSON.stringify({
      version: 1,
      bindings: {
        ...defaultApplicationShortcutBindings,
        createAgent: defaultApplicationShortcutBindings.createTerminal
      }
    })
  ])('falls back atomically when persisted data is invalid or conflicting', (stored) => {
    window.localStorage.setItem(shortcutBindingsStorageKey, stored)

    expect(readApplicationShortcutBindings()).toEqual(defaultApplicationShortcutBindings)
  })
})
