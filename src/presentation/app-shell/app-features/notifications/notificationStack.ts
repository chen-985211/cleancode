import type { AppNotification } from '../../../shared/notifications/appNotifications'
import { notificationOccurrenceKey } from './notificationIdentity'

export interface AppNotificationPresentation {
  readonly exitToken: number
  readonly notification: AppNotification
  readonly open: boolean
}

interface NotificationStackState {
  readonly presentations: readonly AppNotificationPresentation[]
  readonly inspecting: boolean
  readonly newestFirst: readonly string[]
  readonly order: readonly string[]
}

export function createNotificationStackState(): NotificationStackState {
  return { presentations: [], inspecting: false, newestFirst: [], order: [] }
}

export function synchronizeNotificationStack(
  state: NotificationStackState,
  presentations: readonly AppNotificationPresentation[],
  inspecting: boolean
): NotificationStackState {
  if (state.presentations === presentations && state.inspecting === inspecting) return state
  const previous = new Map(state.presentations.map((item) => [item.notification.id, item]))
  const ids = presentations.map(({ notification }) => notification.id)
  const remaining = new Set(ids)
  const arrivals = presentations
    .filter((item) => {
      const before = previous.get(item.notification.id)
      return (
        item.open &&
        (!before?.open ||
          notificationOccurrenceKey(before.notification) !==
            notificationOccurrenceKey(item.notification))
      )
    })
    .map(({ notification }) => notification.id)
    .reverse()
  const newestFirst = [...new Set([...arrivals, ...state.newestFirst, ...ids.reverse()])].filter(
    (id) => remaining.has(id)
  )
  const order = inspecting
    ? [...new Set([...state.order, ...newestFirst])].filter((id) => remaining.has(id))
    : newestFirst
  return { presentations, inspecting, newestFirst, order }
}
