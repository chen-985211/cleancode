import { useEffect, useRef } from 'react'

import type { AppNotificationController } from '../../../../presentation/shared/notifications/appNotifications'
import { useI18n } from '../../../../presentation/i18n/useI18n'
import type { AgentFeedbackEvent } from './agentProviderFeedback'

export function useAgentProviderNotifications({
  events,
  notifications,
  scopeKey
}: {
  readonly events: readonly AgentFeedbackEvent[]
  readonly notifications: AppNotificationController
  readonly scopeKey: string | null
}): void {
  const { t } = useI18n()
  const baselineRef = useRef({
    events: new Set(events),
    scopeKey
  })

  useEffect(() => {
    const currentEvents = new Set(events)
    if (baselineRef.current.scopeKey !== scopeKey) {
      baselineRef.current = { events: currentEvents, scopeKey }
      return
    }

    for (const event of currentEvents) {
      if (baselineRef.current.events.has(event)) continue
      notifications.notify({
        autoDismissMs: 6_000,
        kind: 'warning',
        title: feedbackEventLabel(event, t)
      })
    }
    baselineRef.current = { events: currentEvents, scopeKey }
  }, [events, notifications, scopeKey, t])
}

type Translate = ReturnType<typeof useI18n>['t']

function feedbackEventLabel(event: AgentFeedbackEvent, t: Translate): string {
  switch (event) {
    case 'binding_save_failed':
      return t('provider.bindingSaveFailed')
  }
}
