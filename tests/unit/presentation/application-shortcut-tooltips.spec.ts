import { createApplicationShortcutTooltipLabels } from '../../../src/presentation/app-shell/applicationShortcutTooltips'
import {
  defaultApplicationShortcutBindings,
  type ApplicationShortcutBindings
} from '../../../src/presentation/app-shell/applicationShortcuts'
import { translate } from '../../../src/presentation/app-shell/i18n/messages'

describe('application shortcut tooltips', () => {
  it('formats every default binding for the active platform', () => {
    const macLabels = createApplicationShortcutTooltipLabels(
      defaultApplicationShortcutBindings,
      'mac',
      (key, variables) => translate('zh-CN', key, variables)
    )
    const otherLabels = createApplicationShortcutTooltipLabels(
      defaultApplicationShortcutBindings,
      'other',
      (key, variables) => translate('en', key, variables)
    )

    expect(macLabels).toEqual({
      openSettings: '打开设置 (⌘,)',
      toggleSidebar: '切换侧边栏 (⌘B)',
      createTerminal: '新建终端积木 (⌘T)',
      createAgent: '新建 Agent (⌘⇧A)',
      groupTerminals: '组合终端 (⌘G)'
    })
    expect(otherLabels.createAgent).toBe('New Agent (Ctrl+Shift+A)')
    expect(otherLabels.createTerminal).toBe('New terminal block (Ctrl+T)')
  })

  it('tracks custom bindings and omits empty shortcut parentheses', () => {
    const bindings: ApplicationShortcutBindings = {
      ...defaultApplicationShortcutBindings,
      toggleSidebar: { alt: true, key: 'K', primary: true, shift: true },
      groupTerminals: null
    }

    const labels = createApplicationShortcutTooltipLabels(bindings, 'mac', (key, variables) =>
      translate('zh-CN', key, variables)
    )

    expect(labels.toggleSidebar).toBe('切换侧边栏 (⌘⌥⇧K)')
    expect(labels.groupTerminals).toBe('组合终端')
  })
})
