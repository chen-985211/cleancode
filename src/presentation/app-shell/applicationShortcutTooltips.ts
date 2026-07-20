import {
  applicationShortcutCommands,
  formatShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand,
  type ShortcutPlatform
} from './applicationShortcuts'
import type { MessageKey, Translate } from './i18n/messages'

export const applicationShortcutCommandMessageKeys: Readonly<
  Record<ApplicationShortcutCommand, MessageKey>
> = {
  openSettings: 'settings.shortcuts.command.openSettings',
  toggleSidebar: 'settings.shortcuts.command.toggleSidebar',
  createTerminal: 'settings.shortcuts.command.createTerminal',
  createAgent: 'settings.shortcuts.command.createAgent',
  groupTerminals: 'settings.shortcuts.command.groupTerminals'
}

export type ApplicationShortcutTooltipLabels = Readonly<Record<ApplicationShortcutCommand, string>>

export function createApplicationShortcutTooltipLabels(
  bindings: ApplicationShortcutBindings,
  platform: ShortcutPlatform,
  t: Translate
): ApplicationShortcutTooltipLabels {
  return Object.fromEntries(
    applicationShortcutCommands.map((command) => {
      const action = t(applicationShortcutCommandMessageKeys[command])
      const shortcut = formatShortcutBinding(bindings[command], platform).join(
        platform === 'mac' ? '' : '+'
      )

      return [command, shortcut ? t('settings.shortcuts.tooltip', { action, shortcut }) : action]
    })
  ) as unknown as ApplicationShortcutTooltipLabels
}
