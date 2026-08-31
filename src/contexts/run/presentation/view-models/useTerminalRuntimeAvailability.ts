import { useEffect, useRef, useState } from 'react'

import type { TerminalRuntimeAvailabilitySnapshot } from '../../application/dto/TerminalRuntimeAvailability'
import {
  createExpectedAppError,
  getAppErrorCode
} from '../../../../shared-kernel/application/errors/AppError'
import { resolveUserFacingErrorMessage } from '../../../../presentation/shared/errors/appErrorMessages'
import type {
  AppNotificationController,
  AppNotificationInput
} from '../../../../presentation/shared/notifications/appNotifications'
import { useI18n } from '../../../../presentation/i18n/useI18n'

const readyFallback: TerminalRuntimeAvailabilitySnapshot = {
  phase: 'ready',
  epoch: 1,
  errorCode: null,
  retryable: false
}

const initializingRuntime: TerminalRuntimeAvailabilitySnapshot = {
  phase: 'initializing',
  epoch: 0,
  errorCode: null,
  retryable: false
}

export function useTerminalRuntimeAvailability(
  notifications: AppNotificationController
): TerminalRuntimeAvailabilitySnapshot {
  const { t } = useI18n()
  const [availability, setAvailability] = useState<TerminalRuntimeAvailabilitySnapshot>(() =>
    supportsRuntimeAvailability(window.cleancode) ? initializingRuntime : readyFallback
  )
  const nativeEventVersionRef = useRef(0)
  const notificationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const api = window.cleancode
    if (!supportsRuntimeAvailability(api)) return undefined

    const initialEventVersion = nativeEventVersionRef.current
    const unsubscribe = api.onTerminalRuntimeAvailability((snapshot) => {
      nativeEventVersionRef.current += 1
      setAvailability(snapshot)
    })

    void api
      .getTerminalRuntimeAvailability()
      .then((snapshot) => {
        if (nativeEventVersionRef.current === initialEventVersion) setAvailability(snapshot)
      })
      .catch((error) => {
        if (nativeEventVersionRef.current !== initialEventVersion) return
        setAvailability(toUnavailableSnapshot(error))
      })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (availability.phase !== 'unavailable') {
      if (notificationIdRef.current) {
        notifications.dismiss(notificationIdRef.current)
        notificationIdRef.current = null
      }
      return
    }

    const notification = createUnavailableNotification(availability, setAvailability, t)
    if (!notificationIdRef.current) {
      notificationIdRef.current = notifications.notify(notification)
      return
    }
    if (!notifications.update(notificationIdRef.current, notification)) {
      notificationIdRef.current = notifications.notify(notification)
    }
  }, [availability, notifications, t])

  useEffect(
    () => () => {
      if (notificationIdRef.current) notifications.dismiss(notificationIdRef.current)
    },
    [notifications]
  )

  return availability
}

function createUnavailableNotification(
  availability: TerminalRuntimeAvailabilitySnapshot,
  setAvailability: (snapshot: TerminalRuntimeAvailabilitySnapshot) => void,
  t: ReturnType<typeof useI18n>['t']
): AppNotificationInput {
  const error = availability.errorCode
    ? createExpectedAppError(availability.errorCode, 'Terminal runtime is unavailable.')
    : null
  return {
    kind: 'error',
    autoDismissMs: 0,
    title: t('terminalRuntime.unavailableTitle'),
    message: error
      ? resolveUserFacingErrorMessage(error, 'terminalRuntime.unavailableMessage', t)
      : t('terminalRuntime.unavailableMessage'),
    action: availability.retryable
      ? {
          icon: 'retry',
          label: t('terminalRuntime.retry'),
          pendingLabel: t('terminalRuntime.retrying'),
          onClick: async () => {
            const api = window.cleancode
            if (!supportsRuntimeAvailability(api)) return
            try {
              setAvailability(await api.retryTerminalRuntime())
            } catch (retryError) {
              setAvailability(toUnavailableSnapshot(retryError))
            }
          }
        }
      : undefined
  }
}

function supportsRuntimeAvailability(
  api: Window['cleancode']
): api is NonNullable<Window['cleancode']> {
  return Boolean(
    api &&
    typeof api.getTerminalRuntimeAvailability === 'function' &&
    typeof api.retryTerminalRuntime === 'function' &&
    typeof api.onTerminalRuntimeAvailability === 'function'
  )
}

function toUnavailableSnapshot(error: unknown): TerminalRuntimeAvailabilitySnapshot {
  return {
    phase: 'unavailable',
    epoch: 0,
    errorCode: getAppErrorCode(error) ?? 'UNEXPECTED_ERROR',
    retryable: true
  }
}
