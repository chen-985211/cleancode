import type { NotifyApp } from '../shared/notifications/appNotifications'
import { resolveUserFacingErrorMessage } from '../shared/errors/appErrorMessages'
import { translate, type Translate } from '../i18n/messages'

export function notifyTerminalLaunchFailure(
  notify: NotifyApp,
  error: unknown,
  t: Translate = defaultTranslate
): void {
  notify({
    kind: 'error',
    title: t('terminalLaunch.failedTitle'),
    message: resolveUserFacingErrorMessage(error, 'terminalLaunch.failed', t)
  })
}

const defaultTranslate: Translate = (key, variables) => translate('zh-CN', key, variables)
