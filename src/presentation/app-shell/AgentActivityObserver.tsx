import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type {
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../contexts/agent/application/dto/AgentActivityProtocol'
import { AgentProviderIcon } from './AgentProviderIcon'
import { AgentActivityStore, type AgentActivityNotificationProjection } from './agentActivityStore'
import type { AgentActivityNavigationTarget } from './agentActivityNavigation'
import { useI18n } from './i18n/useI18n'
import { AgentActivityStoreContext } from './useAgentActivitySnapshots'
import { useNotifications } from './useNotifications'
import {
  formatProviderDisplayName,
  useAgentProviderCatalog,
  type AgentProviderCatalogState
} from './useAgentProviderCatalog'

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

interface AgentActivityObserverProps {
  readonly children: ReactNode
  readonly onNavigate: (target: AgentActivityNavigationTarget) => void
}

export function AgentActivityObserver({ children, onNavigate }: AgentActivityObserverProps) {
  const [store] = useState(() => new AgentActivityStore())
  const notifications = useNotifications()
  const { t } = useI18n()
  const providerCatalog = useAgentProviderCatalog()
  const notificationsRef = useRef(notifications)
  const publishedNotificationsRef = useRef(new Map<string, PublishedAgentActivityNotification>())
  const providerCatalogRef = useRef(providerCatalog)
  const navigateRef = useRef(onNavigate)
  const translateRef = useRef(t)

  useEffect(() => {
    notificationsRef.current = notifications
    navigateRef.current = onNavigate
    providerCatalogRef.current = providerCatalog
    translateRef.current = t
  }, [notifications, onNavigate, providerCatalog, t])

  useEffect(() => {
    for (const [messageKey, published] of publishedNotificationsRef.current) {
      if (
        !notifications.update(
          published.id,
          createNotificationInput(published.projection, t, providerCatalog, onNavigate)
        )
      ) {
        publishedNotificationsRef.current.delete(messageKey)
      }
    }
  }, [notifications, onNavigate, providerCatalog, t])

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
          translateRef.current,
          providerCatalogRef.current,
          navigateRef.current
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
  t: Translate,
  providerCatalog: AgentProviderCatalogState,
  onNavigate: (target: AgentActivityNavigationTarget) => void
): void {
  if (projection.type === 'attention_resolved') {
    const published = publishedNotifications.get(projection.messageKey)
    if (published?.projection.type !== 'attention') return

    notifications.dismiss(published.id)
    publishedNotifications.delete(projection.messageKey)
    return
  }

  if (projection.type === 'turn_completed') {
    const id = notifications.notify(
      createNotificationInput(projection, t, providerCatalog, onNavigate)
    )
    rememberPublishedNotification(
      publishedNotifications,
      projection.messageIdentity.key,
      { id, projection },
      notifications
    )
    return
  }

  const id = notifications.notify(
    createNotificationInput(projection, t, providerCatalog, onNavigate)
  )
  rememberPublishedNotification(
    publishedNotifications,
    projection.messageIdentity.key,
    { id, projection },
    notifications
  )
}

function createNotificationInput(
  projection: Exclude<AgentActivityNotificationProjection, { type: 'attention_resolved' }>,
  t: Translate,
  providerCatalog: AgentProviderCatalogState,
  onNavigate: (target: AgentActivityNavigationTarget) => void
) {
  const source = formatAgentActivitySource(projection.source, providerCatalog)
  const agentName = projection.source.agentName ?? 'Agent'
  const isTurnCompleted = projection.type === 'turn_completed'
  const turnCompletedLabel = isTurnCompleted ? t('agentActivity.turnCompleted') : null
  const title = isTurnCompleted
    ? agentName
    : projection.status === 'waiting_approval'
      ? t('agentActivity.waitingApproval', { agentName })
      : t('agentActivity.waitingInput', { agentName })
  return {
    accessibleLabel: [title, turnCompletedLabel, source.providerName, source.label]
      .filter(Boolean)
      .join(' — '),
    activation: {
      label: t('agentActivity.focusSource', { agentName, source: source.label }),
      onClick: () =>
        onNavigate({
          target: projection.source.target
        })
    },
    identity: projection.messageIdentity,
    kind: isTurnCompleted ? ('success' as const) : ('warning' as const),
    leadingIcon: <AgentProviderIcon icon={source.providerIcon} />,
    source: {
      label: source.label
    },
    title,
    ...(turnCompletedLabel
      ? {
          titleStatus: {
            icon: <CheckIcon size={13} weight="bold" aria-hidden="true" />,
            label: turnCompletedLabel
          }
        }
      : {})
  }
}

function formatAgentActivitySource(
  source: Extract<AgentActivityNotificationProjection, { type: 'attention' }>['source'],
  providerCatalog: AgentProviderCatalogState
) {
  const provider =
    providerCatalog.status === 'ready'
      ? (providerCatalog.providers.find((candidate) => candidate.id === source.providerId) ?? null)
      : null
  const projectName = getPathBasename(source.projectDirectory) ?? source.projectId
  const workspaceName =
    source.gitBranch ?? getPathBasename(source.workspaceDirectory) ?? source.workspaceId
  return {
    label: `${projectName} · ${workspaceName}`,
    providerIcon: provider?.icon ?? null,
    providerName: provider?.displayName ?? formatProviderDisplayName(source.providerId)
  }
}

function getPathBasename(directory: string): string | null {
  return directory.split(/[\\/]/).filter(Boolean).at(-1) ?? null
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
