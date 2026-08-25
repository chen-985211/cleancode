import { EventEmitter } from 'node:events'

import {
  bindApplicationQuitShortcut,
  matchesApplicationQuitShortcut,
  type ApplicationQuitShortcutInput,
  type ApplicationQuitShortcutTarget
} from '../../../src/platform/electron-main/applicationQuitShortcut'

function shortcutInput(
  overrides: Partial<ApplicationQuitShortcutInput> = {}
): ApplicationQuitShortcutInput {
  return {
    alt: false,
    control: false,
    isAutoRepeat: false,
    isComposing: false,
    key: 'q',
    meta: false,
    shift: false,
    type: 'keyDown',
    ...overrides
  }
}

describe('application quit shortcut', () => {
  it.each([
    ['darwin', 'darwin', shortcutInput({ meta: true })],
    ['win32', 'win32', shortcutInput({ control: true })],
    ['linux', 'linux', shortcutInput({ control: true })],
    ['linux auto repeat', 'linux', shortcutInput({ control: true, isAutoRepeat: true })],
    ['win32 IME composition', 'win32', shortcutInput({ control: true, isComposing: true })]
  ] as const)('matches the primary-modifier Q shortcut on %s', (_name, platform, input) => {
    expect(matchesApplicationQuitShortcut(input, platform)).toBe(true)
  })

  it.each([
    ['macOS Control+Q', 'darwin', shortcutInput({ control: true })],
    ['Windows Command+Q', 'win32', shortcutInput({ meta: true })],
    ['Linux Command+Q', 'linux', shortcutInput({ meta: true })],
    ['additional Shift', 'linux', shortcutInput({ control: true, shift: true })],
    ['additional Alt', 'win32', shortcutInput({ alt: true, control: true })],
    ['key release', 'darwin', shortcutInput({ meta: true, type: 'keyUp' })],
    ['different key', 'darwin', shortcutInput({ key: 'w', meta: true })]
  ] as const)('rejects %s', (_name, platform, input) => {
    expect(matchesApplicationQuitShortcut(input, platform)).toBe(false)
  })

  it('prevents every matching page and menu event while forwarding deduplication to the coordinator', () => {
    const target = new EventEmitter()
    const requestConfirmation = vi.fn()
    const preventDefault = vi.fn()
    const dispose = bindApplicationQuitShortcut({
      platform: 'darwin',
      requestConfirmation,
      target: target as unknown as ApplicationQuitShortcutTarget
    })

    target.emit('before-input-event', { preventDefault }, shortcutInput({ meta: true }))
    target.emit(
      'before-input-event',
      { preventDefault },
      shortcutInput({ meta: true, isAutoRepeat: true })
    )

    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(requestConfirmation).toHaveBeenCalledTimes(2)

    dispose()
    target.emit('before-input-event', { preventDefault }, shortcutInput({ meta: true }))
    expect(requestConfirmation).toHaveBeenCalledTimes(2)
  })
})
