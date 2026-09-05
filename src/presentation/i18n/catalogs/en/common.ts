import type { zhCNCommonMessages } from '../zh-CN/common'

export const enCommonMessages = {
  'app.settings': 'Application settings',
  'app.windowNavigation': 'Window navigation',
  'app.workspace': 'cleancode workspace',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.remove': 'Remove',
  'applicationQuit.title': 'Quit cleancode?',
  'applicationQuit.confirm': 'Quit',
  'language.settings': 'Language',
  'language.simplifiedChinese': '简体中文',
  'language.english': 'English',
  'notifications.label': 'Notifications',
  'notifications.dismiss': 'Dismiss “{title}” notification',
  'notifications.dismissTitle': 'Dismiss notification'
} as const satisfies { readonly [Key in keyof typeof zhCNCommonMessages]: string }
