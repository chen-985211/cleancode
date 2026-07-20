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
  addProject: 'settings.shortcuts.command.addProject',
  createBranchWorkspace: 'settings.shortcuts.command.createBranchWorkspace',
  previousWorkspace: 'settings.shortcuts.command.previousWorkspace',
  nextWorkspace: 'settings.shortcuts.command.nextWorkspace',
  createTerminal: 'settings.shortcuts.command.createTerminal',
  createAgent: 'settings.shortcuts.command.createAgent',
  groupTerminals: 'settings.shortcuts.command.groupTerminals',
  panCanvasLeft: 'settings.shortcuts.command.panCanvasLeft',
  panCanvasRight: 'settings.shortcuts.command.panCanvasRight',
  panCanvasUp: 'settings.shortcuts.command.panCanvasUp',
  panCanvasDown: 'settings.shortcuts.command.panCanvasDown',
  zoomCanvasIn: 'settings.shortcuts.command.zoomCanvasIn',
  zoomCanvasOut: 'settings.shortcuts.command.zoomCanvasOut',
  fitCanvas: 'settings.shortcuts.command.fitCanvas',
  toggleMinimap: 'settings.shortcuts.command.toggleMinimap'
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
