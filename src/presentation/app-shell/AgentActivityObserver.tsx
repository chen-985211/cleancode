import { useEffect, useRef, useState, type ReactNode } from 'react'

import type {
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityStore, type AgentActivityNotificationProjection } from './agentActivityStore'
import { useI18n } from './i18n/useI18n'
import { AgentActivityStoreContext } from './useAgentActivitySnapshots'
import { useNotifications } from './useNotifications'
import { formatProviderDisplayName } from './useAgentProviderCatalog'

type AgentActivityRendererApi = Pick<
  NonNullable<Window['cleancode']>,
  'listAgentActivities' | 'onAgentActivityChanged' | 'onAgentTurnCompleted'
>

type PendingAgentActivityEvent =
  | { readonly snapshot: TerminalAgentActivitySnapshot; readonly type: 'activity_changed' }
  | { readonly completion: AgentTurnCompletedEvent; readonly type: 'turn_completed' }

interface PublishedAgentActivityNotification {
  readonly id: string
  readonly projection: Exclude<AgentActivityNotificationProjection, { type: 'attention_resolved' }>
}

const publishedNotificationLimit = 256

export function AgentActivityObserver({ children }: { readonly children: ReactNode }) {
  const [store] = useState(() => new AgentActivityStore())
  const notifications = useNotifications()
  const { t } = useI18n()
  const notificationsRef = useRef(notifications)
  const publishedNotificationsRef = useRef(new Map<string, PublishedAgentActivityNotification>())
  const translateRef = useRef(t)

  useEffect(() => {
    notificationsRef.current = notifications
    translateRef.current = t
  }, [notifications, t])

  useEffect(() => {
    for (const [messageKey, published] of publishedNotificationsRef.current) {
      if (!notifications.update(published.id, createNotificationInput(published.projection, t))) {
        publishedNotificationsRef.current.delete(messageKey)
      }
    }
  }, [notifications, t])

  useEffect(() => {
    const api = resolveAgentActivityApi()
    if (!api) return undefined

    let active = true
    let baselineEstablished = false
    const pendingEvents: PendingAgentActivityEvent[] = []
    const projectEvent = (event: PendingAgentActivityEvent, isLiveReplay = false): void => {
      const projection =
        event.type === 'activity_changed'
          ? isLiveReplay
            ? store.recordLiveActivity(event.snapshot)
            : store.recordActivity(event.snapshot)
          : store.recordCompletion(event.completion)
      if (projection) {
        projectNotification(
          projection,
          notificationsRef.current,
          publishedNotificationsRef.current,
          translateRef.current
        )
      }
    }
    const receiveEvent = (event: PendingAgentActivityEvent): void => {
      if (!baselineEstablished) {
        pendingEvents.push(event)
        return
      }
      projectEvent(event)
    }

    let unsubscribeActivity: () => void = () => undefined
    let unsubscribeCompletion: () => void = () => undefined
    try {
      unsubscribeActivity = api.onAgentActivityChanged((snapshot) =>
        receiveEvent({ snapshot, type: 'activity_changed' })
      )
      unsubscribeCompletion = api.onAgentTurnCompleted((completion) =>
        receiveEvent({ completion, type: 'turn_completed' })
      )
    } catch {
      unsubscribeActivity()
      unsubscribeCompletion()
      return undefined
    }

    void readBaseline(api).then((snapshots) => {
      if (!active) return
      store.establishBaseline(snapshots)
      baselineEstablished = true
      for (const event of pendingEvents) projectEvent(event, true)
      pendingEvents.length = 0
    })

    return () => {
      active = false
      unsubscribeActivity()
      unsubscribeCompletion()
    }
  }, [store])

  return (
    <AgentActivityStoreContext.Provider value={store}>
      {children}
    </AgentActivityStoreContext.Provider>
  )
}

type Translate = ReturnType<typeof useI18n>['t']
type Notifications = ReturnType<typeof useNotifications>

function projectNotification(
  projection: AgentActivityNotificationProjection,
  notifications: Notifications,
  publishedNotifications: Map<string, PublishedAgentActivityNotification>,
  t: Translate
): void {
  if (projection.type === 'attention_resolved') {
    const published = publishedNotifications.get(projection.messageKey)
    if (published?.projection.type !== 'attention') return

    notifications.dismiss(published.id)
    publishedNotifications.delete(projection.messageKey)
    return
  }

  if (projection.type === 'turn_completed') {
    const id = notifications.notify(createNotificationInput(projection, t))
    rememberPublishedNotification(
      publishedNotifications,
      projection.messageIdentity.key,
      { id, projection },
      notifications
    )
    return
  }

  const id = notifications.notify(createNotificationInput(projection, t))
  rememberPublishedNotification(
    publishedNotifications,
    projection.messageIdentity.key,
    { id, projection },
    notifications
  )
}

function createNotificationInput(
  projection: Exclude<AgentActivityNotificationProjection, { type: 'attention_resolved' }>,
  t: Translate
) {
  const source = formatAgentActivitySource(projection.source)
  const title =
    projection.type === 'turn_completed'
      ? t('agentActivity.turnCompleted')
      : projection.status === 'waiting_approval'
        ? t('agentActivity.waitingApproval')
        : t('agentActivity.waitingInput')
  return {
    accessibleLabel: `${title} — ${source}`,
    identity: projection.messageIdentity,
    kind: projection.type === 'turn_completed' ? ('success' as const) : ('warning' as const),
    message: source,
    title
  }
}

function formatAgentActivitySource(
  source: Extract<AgentActivityNotificationProjection, { type: 'attention' }>['source']
): string {
  const providerName = formatProviderDisplayName(source.providerId)
  const workspaceName =
    source.gitBranch ?? source.workspaceDirectory.split(/[\\/]/).filter(Boolean).at(-1)
  return [source.agentName, providerName, workspaceName].filter(Boolean).join(' · ')
}

function rememberPublishedNotification(
  publishedNotifications: Map<string, PublishedAgentActivityNotification>,
  messageKey: string,
  published: PublishedAgentActivityNotification,
  notifications: Notifications
): void {
  publishedNotifications.delete(messageKey)
  publishedNotifications.set(messageKey, published)
  while (publishedNotifications.size > publishedNotificationLimit) {
    const oldestKey = publishedNotifications.keys().next().value as string | undefined
    if (oldestKey === undefined) return
    const oldest = publishedNotifications.get(oldestKey)
    if (oldest) notifications.dismiss(oldest.id)
    publishedNotifications.delete(oldestKey)
  }
}

async function readBaseline(
  api: AgentActivityRendererApi
): Promise<readonly TerminalAgentActivitySnapshot[]> {
  try {
    return await api.listAgentActivities()
  } catch {
    return []
  }
}

function resolveAgentActivityApi(): AgentActivityRendererApi | null {
  const runtime = window.cleancode
  if (!runtime) return null

  const { listAgentActivities, onAgentActivityChanged, onAgentTurnCompleted } = runtime
  if (
    typeof listAgentActivities !== 'function' ||
    typeof onAgentActivityChanged !== 'function' ||
    typeof onAgentTurnCompleted !== 'function'
  ) {
    return null
  }

  return {
    listAgentActivities: () => listAgentActivities.call(runtime),
    onAgentActivityChanged: (listener) => onAgentActivityChanged.call(runtime, listener),
    onAgentTurnCompleted: (listener) => onAgentTurnCompleted.call(runtime, listener)
  }
}
