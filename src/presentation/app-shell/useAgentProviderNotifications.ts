import { useEffect, useRef } from 'react'

import type { AgentFeedbackEvent } from './agentProviderFeedback'
import { useI18n } from './i18n/useI18n'
import { useOptionalNotifications } from './useNotifications'

export function useAgentProviderNotifications({
  events,
  scopeKey
}: {
  readonly events: readonly AgentFeedbackEvent[]
  readonly scopeKey: string | null
}): void {
  const { t } = useI18n()
  const notifications = useOptionalNotifications()
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
    case 'mcp_unavailable':
      return t('provider.mcpUnavailable')
  }
}
