import {
  defaultApplicationShortcutBindings,
  findShortcutConflict,
  formatShortcutBinding,
  matchesShortcutEvent,
  normalizeShortcutBinding,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcuts'

describe('application shortcut bindings', () => {
  it('provides unique defaults with platform-native labels', () => {
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.openSettings, 'mac')).toEqual([
      '⌘',
      ','
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.toggleSidebar, 'mac')).toEqual([
      '⌘',
      'B'
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.addProject, 'mac')).toEqual([
      '⌘',
      'O'
    ])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.createBranchWorkspace, 'mac')
    ).toEqual(['⌘', 'N'])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.previousWorkspace, 'mac')
    ).toEqual(['⌘', '⇧', '↑'])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.nextWorkspace, 'mac')).toEqual([
      '⌘',
      '⇧',
      '↓'
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.createTerminal, 'mac')).toEqual(
      ['⌘', 'T']
    )
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.createAgent, 'mac')).toEqual([
      '⌘',
      '⇧',
      'A'
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.groupTerminals, 'mac')).toEqual(
      ['⌘', 'G']
    )
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.zoomCanvasIn, 'mac')).toEqual([
      '⌘',
      '='
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.zoomCanvasOut, 'mac')).toEqual([
      '⌘',
      '-'
    ])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.fitCanvas, 'mac')).toEqual([
      '⌘',
      '0'
    ])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.selectCanvasNodeLeft, 'mac')
    ).toEqual(['⌘', '←'])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.selectCanvasNodeRight, 'mac')
    ).toEqual(['⌘', '→'])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.selectCanvasNodeUp, 'mac')
    ).toEqual(['⌘', '↑'])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.selectCanvasNodeDown, 'mac')
    ).toEqual(['⌘', '↓'])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.toggleMinimap, 'mac')).toEqual([
      '⌘',
      '⇧',
      'M'
    ])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.createTerminal, 'other')
    ).toEqual(['Ctrl', 'T'])
    expect(
      formatShortcutBinding(defaultApplicationShortcutBindings.toggleSidebar, 'other')
    ).toEqual(['Ctrl', 'B'])
    expect(formatShortcutBinding(defaultApplicationShortcutBindings.createAgent, 'other')).toEqual([
      'Ctrl',
      'Shift',
      'A'
    ])
    expect(
      new Set(
        Object.values(defaultApplicationShortcutBindings).map((binding) => JSON.stringify(binding))
      ).size
    ).toBe(17)
  })

  it('normalizes primary-modifier combinations and rejects unsafe single keys', () => {
    expect(
      normalizeShortcutBinding(
        new KeyboardEvent('keydown', { key: 't', metaKey: true, shiftKey: true }),
        'mac'
      )
    ).toEqual({ alt: false, key: 'T', primary: true, shift: true })
    expect(
      normalizeShortcutBinding(
        new KeyboardEvent('keydown', { ctrlKey: true, key: ',', shiftKey: false }),
        'other'
      )
    ).toEqual({ alt: false, key: ',', primary: true, shift: false })
    expect(normalizeShortcutBinding(new KeyboardEvent('keydown', { key: 't' }), 'mac')).toBeNull()
    expect(
      normalizeShortcutBinding(new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }), 'mac')
    ).toBeNull()
  })

  it('matches only the exact modifiers for the current platform', () => {
    const binding = defaultApplicationShortcutBindings.createTerminal

    expect(
      matchesShortcutEvent(
        new KeyboardEvent('keydown', { key: 't', metaKey: true }),
        binding,
        'mac'
      )
    ).toBe(true)
    expect(
      matchesShortcutEvent(
        new KeyboardEvent('keydown', { key: 't', metaKey: true, shiftKey: true }),
        binding,
        'mac'
      )
    ).toBe(false)
    expect(
      matchesShortcutEvent(
        new KeyboardEvent('keydown', { altKey: true, key: 't', metaKey: true }),
        binding,
        'mac'
      )
    ).toBe(false)
    expect(
      matchesShortcutEvent(
        new KeyboardEvent('keydown', { ctrlKey: true, key: 't' }),
        binding,
        'mac'
      )
    ).toBe(false)
  })

  it('finds the command that already owns a proposed binding', () => {
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      createAgent: defaultApplicationShortcutBindings.createTerminal
    }

    expect(
      findShortcutConflict(
        bindings,
        'createAgent',
        defaultApplicationShortcutBindings.createTerminal
      )
    ).toBe('createTerminal')
    expect(
      findShortcutConflict(
        defaultApplicationShortcutBindings,
        'createAgent',
        defaultApplicationShortcutBindings.createAgent
      )
    ).toBeNull()
  })
})
