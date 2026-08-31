import {
  applicationShortcutCommands,
  formatShortcutBinding,
  type ApplicationShortcutBindings,
  type ApplicationShortcutCommand,
  type ShortcutPlatform
} from './applicationShortcuts'
import type { MessageKey, Translate } from '../i18n/messages'

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
  selectCanvasNodeLeft: 'settings.shortcuts.command.selectCanvasNodeLeft',
  selectCanvasNodeRight: 'settings.shortcuts.command.selectCanvasNodeRight',
  selectCanvasNodeUp: 'settings.shortcuts.command.selectCanvasNodeUp',
  selectCanvasNodeDown: 'settings.shortcuts.command.selectCanvasNodeDown',
  zoomCanvasIn: 'settings.shortcuts.command.zoomCanvasIn',
  zoomCanvasOut: 'settings.shortcuts.command.zoomCanvasOut',
  fitCanvas: 'settings.shortcuts.command.fitCanvas',
  toggleMinimap: 'settings.shortcuts.command.toggleMinimap',
  quickExecution1: 'settings.shortcuts.command.quickExecution1',
  quickExecution2: 'settings.shortcuts.command.quickExecution2',
  quickExecution3: 'settings.shortcuts.command.quickExecution3',
  quickExecution4: 'settings.shortcuts.command.quickExecution4',
  quickExecution5: 'settings.shortcuts.command.quickExecution5'
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
