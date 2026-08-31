import type {
  AppNotification,
  AppNotificationIdentity,
  AppNotificationInput
} from '../shared/notifications/appNotifications'

type AppMessagePhase = 'open' | 'closing' | 'hidden'

interface AppMessage {
  readonly exitToken: number
  readonly identity?: AppNotificationIdentity
  readonly notification: AppNotification
  readonly phase: AppMessagePhase
}

export interface AppMessageStore {
  readonly messages: readonly AppMessage[]
  readonly nextExitToken: number
  readonly nextNotificationId: number
  readonly semanticTombstones: readonly AppMessageSemanticTombstone[]
}

interface AppMessageSemanticTombstone {
  readonly key: string
  readonly notificationId: string
  readonly occurrenceId: string
}

const semanticHistoryLimit = 256

interface PublishAppMessageResult {
  readonly notificationId: string
  readonly store: AppMessageStore
}

interface UpdateAppMessageResult {
  readonly store: AppMessageStore
  readonly updated: boolean
}

export function createAppMessageStore(): AppMessageStore {
  return {
    messages: [],
    nextExitToken: 0,
    nextNotificationId: 0,
    semanticTombstones: []
  }
}

export function publishAppMessage(
  store: AppMessageStore,
  input: AppNotificationInput
): PublishAppMessageResult {
  if (!input.identity) return appendAppMessage(store, input)

  const messageIndex = store.messages.findIndex(
    (message) => message.identity?.key === input.identity?.key
  )
  const current = store.messages[messageIndex]
  if (current?.identity?.occurrenceId === input.identity.occurrenceId) {
    if (isStaleRevision(current.identity.revision, input.identity.revision)) {
      return { notificationId: current.notification.id, store }
    }

    const nextMessage: AppMessage = {
      ...current,
      identity: input.identity,
      notification: { ...input, id: current.notification.id }
    }
    return {
      notificationId: current.notification.id,
      store: replaceMessage(store, messageIndex, nextMessage)
    }
  }

  const tombstone = findSemanticTombstone(store, input.identity)
  if (tombstone) {
    return { notificationId: current?.notification.id ?? tombstone.notificationId, store }
  }
  if (!current) return appendAppMessage(store, input)

  const replacementStore = current.identity
    ? rememberSemanticTombstone(store, current.identity, current.notification.id)
    : store
  const nextMessage: AppMessage = {
    ...current,
    identity: input.identity,
    notification: { ...input, id: current.notification.id },
    phase: 'open'
  }

  return {
    notificationId: current.notification.id,
    store: replaceMessage(replacementStore, messageIndex, nextMessage)
  }
}

export function updateAppMessage(
  store: AppMessageStore,
  notificationId: string,
  input: AppNotificationInput
): UpdateAppMessageResult {
  const messageIndex = store.messages.findIndex(
    (message) => message.notification.id === notificationId && message.phase === 'open'
  )
  if (messageIndex === -1) return { store, updated: false }

  const current = store.messages[messageIndex]
  if (!current) return { store, updated: false }
  if (current.identity && !canUpdateSemanticOccurrence(current.identity, input.identity)) {
    return { store, updated: false }
  }

  const notification = createUpdatedNotification(current, input)
  return {
    store: replaceMessage(store, messageIndex, {
      ...current,
      ...(current.identity && input.identity ? { identity: input.identity } : {}),
      notification
    }),
    updated: true
  }
}

export function dismissAppMessage(store: AppMessageStore, notificationId: string): AppMessageStore {
  const messageIndex = store.messages.findIndex(
    (message) => message.notification.id === notificationId && message.phase === 'open'
  )
  if (messageIndex === -1) return store

  const current = store.messages[messageIndex]
  if (!current) return store

  const exitToken = store.nextExitToken + 1
  const closingStore = replaceMessage({ ...store, nextExitToken: exitToken }, messageIndex, {
    ...current,
    exitToken,
    phase: 'closing'
  })
  return current.identity
    ? rememberSemanticTombstone(closingStore, current.identity, current.notification.id)
    : closingStore
}

export function completeAppMessageExit(
  store: AppMessageStore,
  notificationId: string,
  exitToken: number
): AppMessageStore {
  const messageIndex = store.messages.findIndex(
    (message) =>
      message.notification.id === notificationId &&
      message.phase === 'closing' &&
      message.exitToken === exitToken
  )
  if (messageIndex === -1) return store

  const current = store.messages[messageIndex]
  if (!current) return store

  if (!current.identity) {
    return {
      ...store,
      messages: store.messages.filter((_, index) => index !== messageIndex)
    }
  }

  return pruneHiddenSemanticMessages(
    replaceMessage(store, messageIndex, { ...current, phase: 'hidden' })
  )
}

function appendAppMessage(
  store: AppMessageStore,
  input: AppNotificationInput
): PublishAppMessageResult {
  const nextNotificationId = store.nextNotificationId + 1
  const notificationId = `app-notification-${nextNotificationId}`
  const message: AppMessage = {
    exitToken: 0,
    ...(input.identity ? { identity: input.identity } : {}),
    notification: { ...input, id: notificationId },
    phase: 'open'
  }

  return {
    notificationId,
    store: {
      ...store,
      messages: [...store.messages, message],
      nextNotificationId
    }
  }
}

function createUpdatedNotification(
  current: AppMessage,
  input: AppNotificationInput
): AppNotification {
  const notification = { ...input, id: current.notification.id }

  if (current.identity) {
    notification.identity = current.identity
  } else {
    delete notification.identity
  }

  return notification
}

function canUpdateSemanticOccurrence(
  current: AppNotificationIdentity,
  incoming: AppNotificationIdentity | undefined
): boolean {
  if (!incoming || current.key !== incoming.key || current.occurrenceId !== incoming.occurrenceId) {
    return false
  }
  return !(
    current.revision !== undefined &&
    incoming.revision !== undefined &&
    incoming.revision < current.revision
  )
}

function isStaleRevision(current: number | undefined, incoming: number | undefined): boolean {
  return current !== undefined && incoming !== undefined && incoming <= current
}

function findSemanticTombstone(
  store: AppMessageStore,
  identity: AppNotificationIdentity
): AppMessageSemanticTombstone | undefined {
  return store.semanticTombstones.find(
    (tombstone) =>
      tombstone.key === identity.key && tombstone.occurrenceId === identity.occurrenceId
  )
}

function rememberSemanticTombstone(
  store: AppMessageStore,
  identity: AppNotificationIdentity,
  notificationId: string
): AppMessageStore {
  const semanticTombstones = [
    ...store.semanticTombstones.filter(
      (tombstone) =>
        tombstone.key !== identity.key || tombstone.occurrenceId !== identity.occurrenceId
    ),
    { key: identity.key, notificationId, occurrenceId: identity.occurrenceId }
  ].slice(-semanticHistoryLimit)

  return { ...store, semanticTombstones }
}

function pruneHiddenSemanticMessages(store: AppMessageStore): AppMessageStore {
  const hiddenMessages = store.messages
    .filter((message) => message.identity && message.phase === 'hidden')
    .sort((left, right) => left.exitToken - right.exitToken)
  const overflow = hiddenMessages.length - semanticHistoryLimit
  if (overflow <= 0) return store

  const removedNotificationIds = new Set(
    hiddenMessages.slice(0, overflow).map((message) => message.notification.id)
  )
  return {
    ...store,
    messages: store.messages.filter(
      (message) => !removedNotificationIds.has(message.notification.id)
    )
  }
}

function replaceMessage(
  store: AppMessageStore,
  messageIndex: number,
  message: AppMessage
): AppMessageStore {
  return {
    ...store,
    messages: store.messages.map((current, index) => (index === messageIndex ? message : current))
  }
}
