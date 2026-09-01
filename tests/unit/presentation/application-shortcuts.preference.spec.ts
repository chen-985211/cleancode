import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcuts'
import {
  readApplicationShortcutBindings,
  shortcutBindingsStorageKey,
  writeApplicationShortcutBindings
} from '../../../src/presentation/app-shell/app-features/shortcuts/applicationShortcutPreference'

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
      ...defaultApplicationShortcutBindings,
      ...legacyBindings,
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar
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
      ...defaultApplicationShortcutBindings,
      ...v2Bindings
    })
  })

  it('migrates the complete v3 catalog and preserves customized or cleared bindings', () => {
    const v3Bindings = {
      openSettings: defaultApplicationShortcutBindings.openSettings,
      toggleSidebar: { alt: true, key: 'B', primary: true, shift: false },
      createTerminal: null,
      createAgent: defaultApplicationShortcutBindings.createAgent,
      groupTerminals: defaultApplicationShortcutBindings.groupTerminals,
      zoomCanvasIn: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasOut: defaultApplicationShortcutBindings.zoomCanvasOut,
      fitCanvas: defaultApplicationShortcutBindings.fitCanvas
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v3Bindings, version: 3 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      ...v3Bindings
    })
  })

  it('keeps a v3 custom binding and leaves a conflicting new default unassigned', () => {
    const v3Bindings = {
      openSettings: defaultApplicationShortcutBindings.openSettings,
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
      createTerminal: { alt: false, key: 'O', primary: true, shift: false },
      createAgent: defaultApplicationShortcutBindings.createAgent,
      groupTerminals: defaultApplicationShortcutBindings.groupTerminals,
      zoomCanvasIn: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasOut: defaultApplicationShortcutBindings.zoomCanvasOut,
      fitCanvas: defaultApplicationShortcutBindings.fitCanvas
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v3Bindings, version: 3 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      ...v3Bindings,
      addProject: null
    })
  })

  it('keeps a v2 custom binding and leaves a conflicting new default unassigned', () => {
    const v2Bindings = {
      openSettings: defaultApplicationShortcutBindings.openSettings,
      toggleSidebar: defaultApplicationShortcutBindings.toggleSidebar,
      createTerminal: { alt: false, key: ']', primary: true, shift: false },
      createAgent: defaultApplicationShortcutBindings.createAgent,
      groupTerminals: defaultApplicationShortcutBindings.groupTerminals
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v2Bindings, version: 2 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      ...v2Bindings,
      zoomCanvasIn: null
    })
  })

  it('migrates the v4 direction bindings to directional node selection', () => {
    const nonDirectionalBindings = Object.fromEntries(
      Object.entries(v6DefaultBindings).filter(
        ([command]) => !command.startsWith('selectCanvasNode')
      )
    )
    const v4Bindings = {
      ...nonDirectionalBindings,
      panCanvasLeft: { alt: true, key: 'H', primary: false, shift: false },
      panCanvasRight: null,
      panCanvasUp: { alt: false, key: 'K', primary: true, shift: false },
      panCanvasDown: { alt: false, key: 'J', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v4Bindings, version: 4 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...nonDirectionalBindings,
      quickExecution1: defaultApplicationShortcutBindings.quickExecution1,
      quickExecution2: defaultApplicationShortcutBindings.quickExecution2,
      quickExecution3: defaultApplicationShortcutBindings.quickExecution3,
      quickExecution4: defaultApplicationShortcutBindings.quickExecution4,
      quickExecution5: defaultApplicationShortcutBindings.quickExecution5,
      selectCanvasNodeLeft: v4Bindings.panCanvasLeft,
      selectCanvasNodeRight: null,
      selectCanvasNodeUp: v4Bindings.panCanvasUp,
      selectCanvasNodeDown: v4Bindings.panCanvasDown
    })
  })

  it('migrates v5 default canvas zoom bindings to the non-conflicting defaults', () => {
    const v5Bindings = {
      ...v6DefaultBindings,
      zoomCanvasIn: { alt: false, key: '=', primary: true, shift: false },
      zoomCanvasOut: { alt: false, key: '-', primary: true, shift: false },
      fitCanvas: { alt: false, key: '0', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v5Bindings, version: 5 })
    )

    expect(readApplicationShortcutBindings()).toEqual(defaultApplicationShortcutBindings)
  })

  it('preserves v5 customized and cleared canvas zoom bindings', () => {
    const v5Bindings = {
      ...v6DefaultBindings,
      zoomCanvasIn: null,
      zoomCanvasOut: { alt: true, key: 'Z', primary: true, shift: false },
      fitCanvas: { alt: false, key: '0', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v5Bindings, version: 5 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      zoomCanvasIn: null,
      zoomCanvasOut: v5Bindings.zoomCanvasOut
    })
  })

  it('leaves a migrated v5 default unassigned when the new binding is already customized', () => {
    const v5Bindings = {
      ...v6DefaultBindings,
      createAgent: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasIn: { alt: false, key: '=', primary: true, shift: false },
      zoomCanvasOut: { alt: false, key: '-', primary: true, shift: false },
      fitCanvas: { alt: false, key: '0', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings: v5Bindings, version: 5 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      createAgent: defaultApplicationShortcutBindings.zoomCanvasIn,
      zoomCanvasIn: null
    })
  })

  it('migrates v6 defaults to fit-canvas backslash and quick slots one through five', () => {
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({
        bindings: {
          ...v6DefaultBindings,
          fitCanvas: { alt: false, key: '1', primary: true, shift: false }
        },
        version: 6
      })
    )

    expect(readApplicationShortcutBindings()).toEqual(defaultApplicationShortcutBindings)
  })

  it('preserves a v6 custom backslash binding while adding non-conflicting quick slots', () => {
    const bindings = {
      ...v6DefaultBindings,
      fitCanvas: { alt: false, key: '\\', primary: true, shift: false }
    }
    window.localStorage.setItem(
      shortcutBindingsStorageKey,
      JSON.stringify({ bindings, version: 6 })
    )

    expect(readApplicationShortcutBindings()).toEqual({
      ...defaultApplicationShortcutBindings,
      ...bindings
    })
  })

  it('writes the complete catalog with preference schema v7', () => {
    writeApplicationShortcutBindings(defaultApplicationShortcutBindings)

    expect(JSON.parse(window.localStorage.getItem(shortcutBindingsStorageKey) ?? '')).toEqual({
      bindings: defaultApplicationShortcutBindings,
      version: 7
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
    JSON.stringify({ version: 4, bindings: {} }),
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

const v6DefaultBindings = Object.fromEntries(
  Object.entries(defaultApplicationShortcutBindings).filter(
    ([command]) => !command.startsWith('quickExecution')
  )
)
