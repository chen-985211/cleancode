import { useEffect } from 'react'

import { isApplicationQuitRequest } from '../../platform/ipc/applicationQuitChannels'
import { useI18n } from './i18n/useI18n'

export function ApplicationQuitConfirmationBridge() {
  const { t } = useI18n()

  useEffect(() => {
    const runtime = window.cleancode
    if (!runtime?.onApplicationQuitRequested || !runtime.showApplicationQuitConfirmation) {
      return undefined
    }

    return runtime.onApplicationQuitRequested((request) => {
      if (!isApplicationQuitRequest(request)) return

      void runtime
        .showApplicationQuitConfirmation({
          cancelLabel: t('common.cancel'),
          confirmLabel: t('applicationQuit.confirm'),
          message: t('applicationQuit.title'),
          requestId: request.requestId
        })
        .catch(() => undefined)
    })
  }, [t])

  return null
}
