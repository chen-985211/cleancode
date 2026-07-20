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
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
      zoomCanvasIn: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasOut: defaultApplicationShortcutBindings.zoomCanvasOut,
      fitCanvas: defaultApplicationShortcutBindings.fitCanvas
    })
  })

  it('migrates the five-command v2 catalog without losing customized bindings', () => {
    const v2Bindings = {
      openSettings: { alt: true, key: ',', primary: true, shift: false },
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
      createTerminal: null,
      createAgent: defaultApplicationShortcutBindings.createAgent,
      groupTerminals: defaultApplicationShortcutBindings.groupTerminals
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v2Bindings, version: 2 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...v2Bindings,
      zoomCanvasIn: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasOut: defaultApplicationShortcutBindings.zoomCanvasOut,
      fitCanvas: defaultApplicationShortcutBindings.fitCanvas
    })
  })

  it('keeps a v2 custom binding and leaves a conflicting new default unassigned', () => {
    const v2Bindings = {
      openSettings: defaultApplicationShortcutBindings.openSettings,
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
      createTerminal: { alt: false, key: '=', primary: true, shift: false },
      createAgent: defaultApplicationShortcutBindings.createAgent,
      groupTerminals: defaultApplicationShortcutBindings.groupTerminals
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v2Bindings, version: 2 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...v2Bindings,
      zoomCanvasIn: null,
      zoomCanvasOut: defaultApplicationShortcutBindings.zoomCanvasOut,
      fitCanvas: defaultApplicationShortcutBindings.fitCanvas
    })
  })

  it('writes the complete catalog with preference schema v3', () => {
    writeApplicationShortcutBindings(defaultApplicationShortcutBindings)

    expect(JSON.parse(window.localStorage.getItem(shortcutBindingsStorageKey) ?? '')).toEqual({
      bindings: defaultApplicationShortcutBindings,
      version: 3
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
    JSON.stringify({ version: 3, bindings: {} }),
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
