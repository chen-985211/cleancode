import type { AppNotification } from '../shared/notifications/appNotifications'

export interface NotificationStatusMotionInput {
  readonly notification: AppNotification
  readonly reducedMotion: boolean
}

export interface NotificationStatusMotionLayer {
  readonly id: number
  readonly notification: AppNotification
  readonly phase: 'current' | 'outgoing'
}

export interface NotificationStatusMotionState extends NotificationStatusMotionInput {
  readonly layers: readonly NotificationStatusMotionLayer[]
  readonly nextLayerId: number
}

export function createNotificationStatusMotionState(
  input: NotificationStatusMotionInput
): NotificationStatusMotionState {
  return {
    ...input,
    layers: [{ id: 0, notification: input.notification, phase: 'current' }],
    nextLayerId: 1
  }
}

export function synchronizeNotificationStatusMotion(
  state: NotificationStatusMotionState,
  input: NotificationStatusMotionInput
): NotificationStatusMotionState {
  const notificationReplaced = state.notification !== input.notification
  const statusPresentationChanged =
    notificationReplaced &&
    hasNotificationStatusPresentationChanged(state.notification, input.notification)
  const preferenceChanged = state.reducedMotion !== input.reducedMotion
  if (!notificationReplaced && !preferenceChanged) return state

  if (input.reducedMotion) {
    const currentLayer =
      state.layers.find((layer) => layer.phase === 'current') ?? state.layers.at(-1)
    return {
      ...input,
      layers: [
        {
          id: currentLayer?.id ?? state.nextLayerId,
          notification: input.notification,
          phase: 'current'
        }
      ],
      nextLayerId: currentLayer ? state.nextLayerId : state.nextLayerId + 1
    }
  }

  if (!statusPresentationChanged) {
    return {
      ...state,
      ...input,
      layers: state.layers.map((layer) =>
        layer.phase === 'current' ? { ...layer, notification: input.notification } : layer
      )
    }
  }

  return {
    ...input,
    layers: [
      ...state.layers.map((layer): NotificationStatusMotionLayer => ({
        ...layer,
        phase: 'outgoing'
      })),
      { id: state.nextLayerId, notification: input.notification, phase: 'current' }
    ],
    nextLayerId: state.nextLayerId + 1
  }
}

function hasNotificationStatusPresentationChanged(
  current: AppNotification,
  incoming: AppNotification
): boolean {
  return (
    current.kind !== incoming.kind ||
    current.title !== incoming.title ||
    Boolean(current.isActivity) !== Boolean(incoming.isActivity) ||
    (current.leadingIcon !== undefined) !== (incoming.leadingIcon !== undefined) ||
    (current.titleStatus?.label ?? null) !== (incoming.titleStatus?.label ?? null)
  )
}

export function completeNotificationStatusMotion(
  state: NotificationStatusMotionState,
  layerId: number
): NotificationStatusMotionState {
  const layer = state.layers.find((candidate) => candidate.id === layerId)
  if (!layer || layer.phase !== 'outgoing') return state
  return { ...state, layers: state.layers.filter((candidate) => candidate.id !== layerId) }
}
