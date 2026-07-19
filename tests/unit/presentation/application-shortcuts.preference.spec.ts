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
